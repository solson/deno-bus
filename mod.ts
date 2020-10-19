import { BufReader } from "https://deno.land/std@0.74.0/io/bufio.ts";
import { join } from "https://deno.land/std@0.74.0/path/mod.ts";
import { HeaderField, MessageType, RawMessage } from "./message.ts";
import { MessageReader } from "./message_reader.ts";
import { encodeEndianess, MessageWriter } from "./message_writer.ts";
import { dbg } from "./util/debug.ts";
import { encodeUtf8, nativeEndian } from "./util/encoding.ts";

function getSessionBusAddr(): string {
  const addr = Deno.env.get("DBUS_SESSION_BUS_ADDRESS");
  if (addr !== undefined) return addr;

  // TODO(solson): We need to DBus-path-escape the XDG_RUNTIME_DIR path.
  const run = Deno.env.get("XDG_RUNTIME_DIR");
  if (run !== undefined) return `unix:path=${join(run, "bus")}`;

  throw new Error("Cannot determine session bus address");
}

console.log(`connecting to ${getSessionBusAddr()}`);

// TODO(solson): We should actually parse bus addresses.
const conn = await Deno.connect({
  path: getSessionBusAddr().slice(10),
  transport: "unix",
});

await Deno.writeAll(conn, encodeUtf8("\0AUTH EXTERNAL 31303030\r\nBEGIN\r\n"));

const response = await BufReader.create(conn).readString("\n");
if (response === null) throw new Error("no auth response from server");
console.log(`server auth response: ${response.trimEnd()}`);

{
  const msg: RawMessage = {
    endianness: nativeEndian(),
    messageType: MessageType.METHOD_CALL,
    flags: 0,
    serial: 1,
    fields: new Map([
      [HeaderField.PATH, { sig: "o", value: "/org/freedesktop/DBus" }],
      [HeaderField.DESTINATION, { sig: "s", value: "org.freedesktop.DBus" }],
      [HeaderField.INTERFACE, { sig: "s", value: "org.freedesktop.DBus" }],
      [HeaderField.MEMBER, { sig: "s", value: "Hello" }],
    ]),
    body: [],
  };
  console.log("\nSENDING: %o", msg);
  await Deno.copy(MessageWriter.encode(msg), conn);
}

// deno-fmt-ignore
{
  const msg: RawMessage = {
    endianness: nativeEndian(),
    messageType: MessageType.METHOD_CALL,
    flags: 0,
    serial: 2,
    fields: new Map([
      [HeaderField.DESTINATION, { sig: "s", value: "org.freedesktop.Notifications" }],
      [HeaderField.PATH, { sig: "o", value: "/org/freedesktop/Notifications" }],
      [HeaderField.INTERFACE, { sig: "s", value: "org.freedesktop.Notifications" }],
      [HeaderField.MEMBER, { sig: "s", value: "Notify" }],
      [HeaderField.SIGNATURE, { sig: "g", value: "susssasa{sv}i" }],
    ]),
    body: ["Deno", 0, "", "", "Hello from Deno", [], new Map(), 5000],
  };
  console.log("\nSENDING: %o", msg);
  await Deno.copy(MessageWriter.encode(msg), conn);
}

while (true) console.log("\nRECEIVING: %o", await MessageReader.read(conn));

// conn.close();
