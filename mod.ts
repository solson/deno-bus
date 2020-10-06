import { BufReader } from "https://deno.land/std@0.72.0/io/bufio.ts";
import { charCode } from "https://deno.land/std@0.72.0/io/util.ts";
import { join } from "https://deno.land/std@0.72.0/path/mod.ts";
import { assertExhaustive } from "./util/assert.ts";
import { dbg } from "./util/debug.ts";
import { Endianness, nativeEndian } from "./util/encoding.ts";

function get_session_bus_addr(): string {
  const addr = Deno.env.get("DBUS_SESSION_BUS_ADDRESS");
  if (addr !== undefined) return addr;

  // TODO(solson): We need to DBus-path-escape the XDG_RUNTIME_DIR path.
  const run = Deno.env.get("XDG_RUNTIME_DIR");
  if (run !== undefined) return `unix:path=${join(run, "bus")}`;

  throw new Error("Cannot determine session bus address");
}

function encodeEndianess(e: Endianness): number {
  return e === Endianness.LE ? charCode("l") : charCode("B");
}

function decodeEndianess(flag: number): Endianness | undefined {
  if (flag === charCode("l")) return Endianness.LE;
  if (flag === charCode("B")) return Endianness.BE;
}

// TODO(solson): In the upcoming TypeScript 4.1, I will be able to precisely
// type the possible DBus signature strings and their corresponding TS types.
type DBusValue = {
  sig: string;
  value: unknown;
};

/** See https://dbus.freedesktop.org/doc/dbus-specification.html#basic-types. */
type FixedType =
  | { sig: "y"; value: number }
  | { sig: "b"; value: boolean }
  | { sig: "n"; value: number }
  | { sig: "q"; value: number }
  | { sig: "i"; value: number }
  | { sig: "u"; value: number }
  | { sig: "x"; value: bigint }
  | { sig: "t"; value: bigint }
  | { sig: "d"; value: number }
  | { sig: "h"; value: never };

// TODO(solson): Probably not like this...
// type DBusValue =
//   | { type: "a", data: { elemSig: DBusSig, elems: unknown[] } }
//   | { type: "r", data: { fieldSigs: DBusSig[], fields: unknown[] } }

type FixedTypeSig = FixedType["sig"];
type FixedTypeUnknown = { sig: FixedTypeSig; value: unknown };
type FixedTypeDesc = { size: number; name: string };

const fixedTypes: Record<FixedTypeSig, FixedTypeDesc> = {
  "y": { size: 1, name: "byte" },
  "b": { size: 4, name: "boolean" },
  "n": { size: 2, name: "int16" },
  "q": { size: 2, name: "uint16" },
  "i": { size: 4, name: "int32" },
  "u": { size: 4, name: "uint32" },
  "x": { size: 8, name: "int64" },
  "t": { size: 8, name: "uint64" },
  "d": { size: 8, name: "double" },
  "h": { size: 4, name: "unixFd" },
};

function isFixedTypeSig(sig: string): sig is FixedTypeSig {
  return sig in fixedTypes;
}

function validateFixed(v: FixedTypeUnknown): asserts v is FixedType {
  switch (v.sig) {
    case "y":
    case "n":
    case "q":
    case "i":
    case "u":
      if (typeof v.value !== "number") throw new ValidationError(v, "number");
      break;
    case "x":
    case "t":
      if (typeof v.value !== "bigint") throw new ValidationError(v, "bigint");
      break;
    case "b":
      if (typeof v.value !== "boolean") throw new ValidationError(v, "boolean");
      break;
    case "d":
      if (typeof v.value !== "number") throw new ValidationError(v, "number");
      break;
  }
}

class ValidationError extends Error {
  constructor(v: FixedTypeUnknown, expected: string) {
    const name = fixedTypes[v.sig].name;
    super(
      `signature "${v.sig}" (${name}) expected ${expected}, ` +
        `got ${typeof v.value} (${v.value})`,
    );
  }
}

/** See https://dbus.freedesktop.org/doc/dbus-specification.html#basic-types. */
type StringTypeSig = "s" | "o" | "g";

type StringTypeInfo = { name: string };

const stringTypes: Record<StringTypeSig, StringTypeInfo> = {
  "s": { name: "string" },
  "o": { name: "objectPath" },
  "g": { name: "signature" },
};

function isStringTypeSig(sig: string): sig is StringTypeSig {
  return sig in stringTypes;
}

// NOTE: Fragment for DBusReader.
// if (this.endianness === undefined) {
//   throw new Error("endian-sensitive read with unknown endianness");
// }

/** See https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol-marshaling. */
class DBusWriter {
  /** Current position within the message, for use in alignment padding. */
  private pos = 0;

  constructor(
    private out: Deno.Writer,
    readonly endianness: Endianness = nativeEndian(),
  ) {}

  async write(sig: string, value: unknown): Promise<void> {
    if (isFixedTypeSig(sig)) {
      await this.writeFixed({ sig, value });
    } else if (isStringTypeSig(sig)) {
      if (typeof value !== "string") throw new Error("todo: proper checking");
      await this.writeString(sig, value);
    } else if (sig === "v") {
      // TODO(solson): Proper assertions.
      const inner = value as DBusValue;
      if (typeof inner.sig !== "string") {
        throw new Error("todo: proper checking");
      }
      await this.write("g", inner.sig);
      await this.write(inner.sig, inner.value);
    } else {
      throw new Error(`todo: ${sig}`);
    }
  }

  async writeFixed(v: FixedTypeUnknown): Promise<void> {
    validateFixed(v);
    const isLE = this.endianness === Endianness.LE;
    const size = fixedTypes[v.sig].size;
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);

    // Every fixed-size type in DBus must be aligned to a position that is a
    // multiple of its size (counting from the start of the current message).
    this.writePadding(size);

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

    await this.writeRawBytes(bytes);
  }

  async writeString(sig: StringTypeSig, value: string): Promise<void> {
    // TODO(solson): Syntactic checks for object paths and signatures.
    const bytes = new TextEncoder().encode(value);

    switch (sig) {
      case "s":
      case "o":
        await this.writeFixed({ sig: "u", value: bytes.length });
        break;
      case "g":
        await this.writeFixed({ sig: "y", value: bytes.length });
        break;
      default:
        assertExhaustive(sig);
    }

    await this.writeRawBytes(bytes);

    // The DBus wire format requires a C-style trailing nul byte, not counted as
    // part of the string length.
    await this.writeRawBytes(new Uint8Array([0]));
  }

  async writeRawBytes(bytes: Uint8Array): Promise<void> {
    await Deno.writeAll(this.out, bytes);
    this.pos += bytes.byteLength;
  }

  async writePadding(alignment: number): Promise<void> {
    if (this.pos % alignment === 0) return;
    const padding = alignment - this.pos % alignment;
    this.writeRawBytes(new Uint8Array(padding));
  }
}

////////////////////////////////////////////////////////////////////////////////

console.log(`connecting to ${get_session_bus_addr()}`);

const conn = await Deno.connect({
  path: get_session_bus_addr().slice(10),
  transport: "unix",
});

const reader = BufReader.create(conn);

await Deno.writeAll(
  conn,
  new TextEncoder().encode("\0AUTH EXTERNAL 31303030\r\nBEGIN\r\n"),
);

const response = (await reader.readString("\n") as string).trimEnd();
console.log(`server auth response: ${response}`);

const out = new DBusWriter(conn);

await out.write("y", encodeEndianess(out.endianness));
await out.write("y", 1); // type = METHOD_CALL
await out.write("y", 0); // flags
await out.write("y", 1); // major protocol version
await out.write("u", 0); // byte length of body
await out.write("u", 1); // serial/cookie
await out.write("u", 0x6E); // fields.byte_len

// fields[0]
await out.writePadding(8);
await out.write("y", 1); // PATH
await out.write("v", { sig: "o", value: "/org/freedesktop/DBus" });

// fields[1]
await out.writePadding(8);
await out.write("y", 6); // DESTINATION
await out.write("v", { sig: "s", value: "org.freedesktop.DBus" });

// fields[2]
await out.writePadding(8);
await out.write("y", 2); // INTERFACE
await out.write("v", { sig: "s", value: "org.freedesktop.DBus" });

// fields[3]
await out.writePadding(8);
await out.write("y", 3); // MEMBER
await out.write("v", { sig: "s", value: "Hello" });

// End-of-header padding just before the body (which is empty).
await out.writePadding(8);

/*
0x6c, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
0x01, 0x00, 0x00, 0x00, 0x6e, 0x00, 0x00, 0x00,

0x01, 0x01, 0x6f, 0x00, 0x15, 0x00, 0x00, 0x00,
0x2f, 0x6f, 0x72, 0x67, 0x2f, 0x66, 0x72, 0x65,
0x65, 0x64, 0x65, 0x73, 0x6b, 0x74, 0x6f, 0x70,
0x2f, 0x44, 0x42, 0x75, 0x73, 0x00, 0x00, 0x00,

0x06, 0x01, 0x73, 0x00, 0x14, 0x00, 0x00, 0x00,
0x6f, 0x72, 0x67, 0x2e, 0x66, 0x72, 0x65, 0x65,
0x64, 0x65, 0x73, 0x6b, 0x74, 0x6f, 0x70, 0x2e,
0x44, 0x42, 0x75, 0x73, 0x00, 0x00, 0x00, 0x00,

0x02, 0x01, 0x73, 0x00, 0x14, 0x00, 0x00, 0x00,
0x6f, 0x72, 0x67, 0x2e, 0x66, 0x72, 0x65, 0x65,
0x64, 0x65, 0x73, 0x6b, 0x74, 0x6f, 0x70, 0x2e,
0x44, 0x42, 0x75, 0x73, 0x00, 0x00, 0x00, 0x00,

0x03, 0x01, 0x73, 0x00, 0x05, 0x00, 0x00, 0x00,
0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x00, 0x00
*/

dbg(
  new TextDecoder().decode(
    await reader.readFull(new Uint8Array(264)) as Uint8Array,
  ),
);

conn.close();
