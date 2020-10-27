import { charCode } from "https://deno.land/std@0.74.0/io/util.ts";
import {
  DBusType2,
  DBusValue,
  FixedType,
  FixedTypeSig,
  fixedTypeSizes,
  FixedTypeVal,
  isFixedTypeSig,
  isStringTypeSig,
  StringTypeSig
} from "./dbus_types.ts";
import { ProtocolError } from "./errors.ts";
import {
  ErrorMsg,
  HeaderField,
  Message,
  MessageType,
  MethodCall,
  MethodReturn,
  Signal,
  UnknownMessage
} from "./message.ts";
import { parseSig, parseSigs } from "./sig_parser.ts";
import { assertExhaustive } from "./util/assert.ts";
import { decodeUtf8, Endianness } from "./util/encoding.ts";
import { readNBytes } from "./util/io.ts";

export function decodeEndianness(flag: number): Endianness | undefined {
  if (flag === charCode("l")) return Endianness.LE;
  if (flag === charCode("B")) return Endianness.BE;
}

/** See https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol-marshaling. */
export class MessageReader {
  private pos = 0;
  #endianness: Endianness | undefined;

  constructor(private reader: Deno.Reader) {}

  static async read(
    reader: Deno.Reader,
  ): Promise<{ msg: Message; serial: number, sender: string }> {
    const r = new MessageReader(reader);
    await r.readEndianness();
    const type = await r.readFixed("y");
    const flags = await r.readFixed("y");

    const majorProtocolVersion = await r.readFixed("y");
    if (majorProtocolVersion !== 1) {
      throw new ProtocolError(
        `unsupported major protocol version: ${majorProtocolVersion}`,
      );
    }

    const bodyLen = await r.readFixed("u");
    // TODO(solson): Validate that serial is non-zero.
    const serial = await r.readFixed("u");
    // TODO(solson): Detect duplicate keys.
    const fields = new Map(await r.read("a(yv)") as [number, DBusValue][]);
    await r.skipPadding(8);
    const sig = fields.get(HeaderField.SIGNATURE)?.value as string ?? "";
    const body = await r.readMany(sig);

    // TODO(solson): Extract to static method on Message.
    // TODO(solson): Check for required field presence.
    // TODO(solson): Capture flags and extra fields.
    let msg: Message;
    switch (type) {
      case MessageType.METHOD_CALL:
        msg = new MethodCall(
          fields.get(HeaderField.DESTINATION)?.value as string,
          fields.get(HeaderField.PATH)?.value as string,
          fields.get(HeaderField.INTERFACE)?.value as string,
          fields.get(HeaderField.MEMBER)?.value as string,
          { sig, values: body },
        );
        break;
      case MessageType.METHOD_RETURN:
        msg = new MethodReturn(
          fields.get(HeaderField.DESTINATION)?.value as string,
          fields.get(HeaderField.REPLY_SERIAL)?.value as number,
          { sig, values: body },
        );
        break;
      case MessageType.ERROR:
        msg = new ErrorMsg(
          fields.get(HeaderField.DESTINATION)?.value as string,
          fields.get(HeaderField.ERROR_NAME)?.value as string,
          fields.get(HeaderField.REPLY_SERIAL)?.value as number,
          { sig, values: body },
        );
        break;
      case MessageType.SIGNAL:
        msg = new Signal(
          fields.get(HeaderField.DESTINATION)?.value as string,
          fields.get(HeaderField.PATH)?.value as string,
          fields.get(HeaderField.INTERFACE)?.value as string,
          fields.get(HeaderField.MEMBER)?.value as string,
          { sig, values: body },
        );
        break;
      default:
        msg = new UnknownMessage({ type, flags, fields, body });
    }

    const sender = fields.get(HeaderField.SENDER)?.value as string;
    return { msg, serial, sender };
  }

  // TODO(solson): Finish the `limit` work.
  async read(sig: string, limit?: number): Promise<unknown> {
    return this.read2(parseSig(sig));
  }

  async readMany(sigs: string): Promise<unknown[]> {
    const types = parseSigs(sigs);
    const values = [];
    for (const type of types) {
      values.push(await this.read2(type));
    }
    return values;
  }

  async read2(t: DBusType2): Promise<unknown> {
    if (isFixedTypeSig(t.type)) {
      return this.readFixed(t.type);
    } else if (isStringTypeSig(t.type)) {
      return this.readString(t.type);
    } else if (t.type === "v") {
      const sig = await this.read("g") as string;
      const value = await this.read(sig);
      return { sig, value };
    } else if (t.type === "a") {
      const length = await this.readFixed("u");

      // FIXME(solson): It's messy to have this in-lined.
      if (isFixedTypeSig(t.elemType.type)) {
        await this.skipPadding(fixedTypeSizes[t.elemType.type]);
      } else if (
        t.elemType.type === "s" || t.elemType.type === "o" ||
        t.elemType.type === "a" || t.elemType.type === "e"
      ) {
        await this.skipPadding(fixedTypeSizes["u"]);
      } else if (t.elemType.type === "r") {
        await this.skipPadding(8);
      }

      // TODO(solson): Check for reads past endPos.
      const endPos = this.pos + length;
      const elems = [];
      while (this.pos < endPos) {
        elems.push(await this.read2(t.elemType));
      }
      return elems;
    } else if (t.type === "r") {
      await this.skipPadding(8);
      const fields = [];
      for (const fieldType of t.fieldTypes) {
        fields.push(await this.read2(fieldType));
      }
      return fields;
    } else if (t.type === "e") {
      const length = await this.readFixed("u");

      // FIXME(solson): It's messy to have this in-lined. This is the alignment
      // of the "element type" which is a dict entry.
      this.skipPadding(8);

      // TODO(solson): Check for reads past endPos.
      const endPos = this.pos + length;
      const map = new Map<unknown, unknown>();
      while (this.pos < endPos) {
        const key = await this.read2(t.keyType);
        const value = await this.read2(t.valueType);
        // TODO(solson): Check for duplicate keys.
        map.set(key, value);
      }
      return map;
    } else {
      assertExhaustive(t.type);
    }
  }

  async readFixed<Sig extends FixedTypeSig>(
    sig: Sig,
  ): Promise<FixedTypeVal<Sig>>;
  async readFixed(sig: FixedTypeSig): Promise<FixedType["value"]> {
    const size = fixedTypeSizes[sig];
    await this.skipPadding(size);
    const isLE = this.endianness === Endianness.LE;
    const bytes = await this.readRawBytes(size);
    const view = new DataView(bytes.buffer);

    switch (sig) {
      case "y":
        return view.getUint8(0);
      case "b": {
        const raw = view.getUint32(0, isLE);
        if (raw !== 0 && raw !== 1) {
          throw new Deno.errors.InvalidData(
            `expected 0 or 1 for boolean, but got ${raw}`,
          );
        }
        return raw === 1;
      }
      case "n":
        return view.getInt16(0, isLE);
      case "q":
        return view.getUint16(0, isLE);
      case "i":
        return view.getInt32(0, isLE);
      case "u":
        return view.getUint32(0, isLE);
      case "x":
        return view.getBigInt64(0, isLE);
      case "t":
        return view.getBigUint64(0, isLE);
      case "d":
        return view.getFloat64(0, isLE);
      case "h":
        throw new Error("todo: unix_fd type");
      default:
        assertExhaustive(sig);
    }
  }

  async readString(sig: StringTypeSig): Promise<string> {
    let length;

    switch (sig) {
      case "s":
      case "o":
        length = await this.readFixed("u");
        break;
      case "g":
        length = await this.readFixed("y");
        break;
      default:
        assertExhaustive(sig);
    }

    // TODO(solson): Syntactic checks for object paths and signatures.
    const str = decodeUtf8(await this.readRawBytes(length));

    // The DBus wire format requires a C-style trailing nul byte, not counted as
    // part of the string length.
    // TODO(solson): Assert this is actually zero.
    await this.readRawBytes(1);

    return str;
  }

  async readEndianness(): Promise<Endianness> {
    const [b] = await this.readRawBytes(1);
    const endianness = decodeEndianness(b);
    if (endianness === undefined) {
      throw new Deno.errors.InvalidData(
        `invalid endianness byte in message: ${b}`,
      );
    }
    this.#endianness = endianness;
    return endianness;
  }

  async readRawBytes(n: number): Promise<Uint8Array> {
    const bytes = await readNBytes(this.reader, n);
    this.pos += n;
    return bytes;
  }

  async skipPadding(alignment: number): Promise<void> {
    if (this.pos % alignment === 0) return;
    const padding = alignment - this.pos % alignment;
    // TODO(solson): Assert all padding is zeroed.
    await this.readRawBytes(padding);
  }

  get endianness(): Endianness {
    if (this.#endianness === undefined) {
      throw new Error("accessed endianness before call to readEndianness");
    }
    return this.#endianness;
  }
}
