import {
  DBusType2,
  DBusValue,
  FixedType,
  FixedTypeSig,
  fixedTypeSizes,
  FixedTypeUnknown,
  FixedTypeVal,
  isFixedTypeSig,
  isStringTypeSig,
  StringTypeSig,
  validateFixed,
} from "./dbus_types.ts";
import { charCode } from "https://deno.land/std@0.74.0/io/util.ts";
import { assertExhaustive } from "./util/assert.ts";
import { encodeUtf8, Endianness, nativeEndian } from "./util/encoding.ts";
import { parseSig, parseSigs } from "./sig_parser.ts";
import { readNBytes } from "./util/io.ts";
import { dbg } from "./util/debug.ts";

export function encodeEndianess(e: Endianness): number {
  if (e === Endianness.LE) return charCode("l");
  if (e === Endianness.BE) return charCode("B");
  assertExhaustive(e);
}

export function decodeEndianness(flag: number): Endianness | undefined {
  if (flag === charCode("l")) return Endianness.LE;
  if (flag === charCode("B")) return Endianness.BE;
}

/** See https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol. */
export enum MessageType {
  METHOD_CALL = 1,
  METHOD_RETURN = 2,
  ERROR = 3,
  SIGNAL = 4,
}

/** See https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol. */
export enum HeaderFlags {
  NO_REPLY_EXPECTED = 0x1,
  NO_AUTO_START = 0x2,
  ALLOW_INTERACTIVE_AUTHORIZATION = 0x4,
}

/** See https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol-header-fields. */
export enum HeaderField {
  PATH = 1,
  INTERFACE = 2,
  MEMBER = 3,
  ERROR_NAME = 4,
  REPLY_SERIAL = 5,
  DESTINATION = 6,
  SENDER = 7,
  SIGNATURE = 8,
  UNIX_FDS = 9,
}

/** See https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol-marshaling. */
export class MessageWriter {
  /** Current position within the message, for use in alignment padding. */
  private pos = 0;

  /**
   * Set of positions associated with `writeLater` calls that have yet to be
   * filled in with values.
   */
  private writeLaterPositions = new Set();

  constructor(
    private buf: Deno.Buffer,
    readonly endianness: Endianness = nativeEndian(),
  ) {}

  write(sig: string, value: unknown): void {
    this.write2(parseSig(sig), value);
  }

  writeMany(sigs: string, ...values: unknown[]): void {
    const types = parseSigs(sigs);
    if (types.length !== values.length) {
      throw new RangeError(
        `signature "${sigs}" requires ${types.length} values, got ${values.length}`,
      );
    }
    for (const [i, type] of types.entries()) {
      this.write2(type, values[i]);
    }
  }

  write2(t: DBusType2, value: unknown): void {
    if (isFixedTypeSig(t.type)) {
      this.writeFixed({ sig: t.type, value });
    } else if (isStringTypeSig(t.type)) {
      if (typeof value !== "string") throw new Error("todo: proper checking");
      this.writeString(t.type, value);
    } else if (t.type === "v") {
      // TODO(solson): Proper assertions.
      const inner = value as DBusValue;
      if (typeof inner.sig !== "string") {
        throw new Error("todo: proper checking");
      }
      this.write("g", inner.sig);
      this.write(inner.sig, inner.value);
    } else if (t.type === "a") {
      // TODO(solson): Proper assertions.
      if (!Array.isArray(value)) throw new Error();
      const elems = value as unknown[];

      const writeLength = this.writeLater("u");

      // FIXME(solson): It's messy to have this in-lined.
      if (isFixedTypeSig(t.elemType.type)) {
        this.writePadding(fixedTypeSizes[t.elemType.type]);
      } else if (
        t.elemType.type === "s" || t.elemType.type === "o" ||
        t.elemType.type === "a" || t.elemType.type === "e"
      ) {
        this.writePadding(fixedTypeSizes["u"]);
      } else if (t.elemType.type === "r") {
        this.writePadding(8);
      }

      writeLength(this.measureLength(() => {
        for (const elem of elems) {
          this.write2(t.elemType, elem);
        }
      }));
    } else if (t.type === "r") {
      // TODO(solson): Proper assertions.
      if (!Array.isArray(value)) throw new Error();
      const fields = value as unknown[];

      // Structs are aligned to a multiple of 8 bytes regardless of field types.
      this.writePadding(8);

      for (let i = 0; i < t.fieldTypes.length; i++) {
        this.write2(t.fieldTypes[i], fields[i]);
      }
    } else if (t.type === "e") {
      // TODO(solson): Proper assertions.
      if (!(value instanceof Map)) throw new Error();
      const map = value as Map<unknown, unknown>;

      const writeLength = this.writeLater("u");

      // FIXME(solson): It's messy to have this in-lined. This is the alignment
      // of the "element type" which is a dict entry.
      this.writePadding(8);

      writeLength(this.measureLength(() => {
        for (const [k, v] of map.entries()) {
          // Dict entries are aligned to a multiple of 8 bytes regardless of key
          // or value types.
          this.writePadding(8);
          this.write2(t.keyType, k);
          this.write2(t.valueType, v);
        }
      }));
    } else {
      assertExhaustive(t.type);
    }
  }

  writeFixed(v: FixedTypeUnknown): void {
    const pos = this.reserveAligned(fixedTypeSizes[v.sig]);
    this.writeFixedAt(pos, v);
  }

  reserveAligned(size: number): number {
    const bytes = new Uint8Array(size);

    // Every fixed-size type in DBus must be aligned to a position that is a
    // multiple of its size (counting from the start of the current message).
    this.writePadding(size);

    const pos = this.pos;
    this.writeRawBytes(bytes);
    return pos;
  }

  writeFixedAt(pos: number, v: FixedTypeUnknown): void {
    validateFixed(v);
    const isLE = this.endianness === Endianness.LE;
    const view = new DataView(this.buf.bytes({ copy: false }).buffer, pos);

    switch (v.sig) {
      case "y":
        view.setUint8(0, v.value);
        break;
      case "b":
        view.setUint32(0, v.value === true ? 1 : 0, isLE);
        break;
      case "n":
        view.setInt16(0, v.value, isLE);
        break;
      case "q":
        view.setUint16(0, v.value, isLE);
        break;
      case "i":
        view.setInt32(0, v.value, isLE);
        break;
      case "u":
        view.setUint32(0, v.value, isLE);
        break;
      case "x":
        view.setBigInt64(0, v.value, isLE);
        break;
      case "t":
        view.setBigUint64(0, v.value, isLE);
        break;
      case "d":
        view.setFloat64(0, v.value, isLE);
        break;
      case "h":
        throw new Error("todo: unix_fd type");
      default:
        assertExhaustive(v);
    }
  }

  writeString(sig: StringTypeSig, value: string): void {
    // TODO(solson): Syntactic checks for object paths and signatures.
    const bytes = encodeUtf8(value);

    switch (sig) {
      case "s":
      case "o":
        this.writeFixed({ sig: "u", value: bytes.length });
        break;
      case "g":
        this.writeFixed({ sig: "y", value: bytes.length });
        break;
      default:
        assertExhaustive(sig);
    }

    this.writeRawBytes(bytes);

    // The DBus wire format requires a C-style trailing nul byte, not counted as
    // part of the string length.
    this.writeRawBytes(new Uint8Array([0]));
  }

  writeRawBytes(bytes: Uint8Array): void {
    Deno.writeAllSync(this.buf, bytes);
    this.pos += bytes.byteLength;
  }

  writePadding(alignment: number): void {
    if (this.pos % alignment === 0) return;
    const padding = alignment - this.pos % alignment;
    this.writeRawBytes(new Uint8Array(padding));
  }

  writeLater(sig: FixedTypeSig): (value: unknown) => void {
    const pos = this.reserveAligned(fixedTypeSizes[sig]);
    this.writeLaterPositions.add(pos);
    return (value) => {
      if (!this.writeLaterPositions.delete(pos)) {
        throw new Error(
          `multiple calls to writeLater callback for signature "${sig}" at position ${pos}`,
        );
      }
      this.writeFixedAt(pos, { sig, value });
    };
  }

  measureLength(f: () => void): number {
    const beforePos = this.pos;
    f();
    return this.pos - beforePos;
  }
}

/** See https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol-marshaling. */
class MessageReader {
  private pos = 0;
  private endianness: Endianness | undefined;

  constructor(private reader: Deno.Reader) {}

  async readFixed<Sig extends FixedTypeSig>(
    sig: Sig,
  ): Promise<FixedTypeVal<Sig>>;
  async readFixed(sig: FixedTypeSig): Promise<FixedType["value"]> {
    const size = fixedTypeSizes[sig];
    await this.skipPadding(size);
    const isLE = this.getEndianness() === Endianness.LE;
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

  async readEndianness(): Promise<void> {
    const [b] = await this.readRawBytes(1);
    const endianness = decodeEndianness(b);
    if (endianness === undefined) {
      throw new Deno.errors.InvalidData(
        `invalid endianness byte in message: ${b}`,
      );
    }
    this.endianness = endianness;
  }

  async readRawBytes(n: number): Promise<Uint8Array> {
    const bytes = await readNBytes(this.reader, n);
    this.pos += n;
    return bytes;
  }

  async skipPadding(alignment: number): Promise<void> {
    if (this.pos % alignment === 0) return;
    const padding = alignment - this.pos % alignment;
    await this.readRawBytes(padding);
  }

  getEndianness(): Endianness {
    if (this.endianness === undefined) {
      throw new Error("getEndianness before call to readEndianness");
    }
    return this.endianness;
  }
}

export async function readMessage(r: Deno.Reader): Promise<void> {
  const mr = new MessageReader(r);
  await mr.readEndianness();
  dbg(MessageType[await mr.readFixed("y")]);
  dbg(await mr.readFixed("y"), "flags");
  dbg(await mr.readFixed("y"), "major protocol version");
  const body_len = dbg(await mr.readFixed("u"), "body length");
  dbg(await mr.readFixed("u"), "serial");
  const fields_len = dbg(await mr.readFixed("u"), "fields length");
  await mr.skipPadding(8);
  dbg(new TextDecoder().decode(await mr.readRawBytes(fields_len)), "fields");
  await mr.skipPadding(8);
  dbg(new TextDecoder().decode(await mr.readRawBytes(body_len)), "body");
}
