import { BufReader } from "https://deno.land/std@0.74.0/io/bufio.ts";
import { join } from "https://deno.land/std@0.74.0/path/mod.ts";
import {
  encodeEndianess,
  HeaderField,
  MessageType,
  MessageWriter,
  readMessage,
} from "./message.ts";
import { encodeUtf8 } from "./util/encoding.ts";

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
  const buf = new Deno.Buffer();
  const msg = new MessageWriter(buf);

  msg.write("y", encodeEndianess(msg.endianness));
  msg.write("y", MessageType.METHOD_CALL);
  msg.write("y", 0); // flags
  msg.write("y", 1); // major protocol version
  msg.write("u", 0); // byte length of body
  msg.write("u", 1); // serial/cookie
  msg.write("a(yv)", [
    [HeaderField.PATH, { sig: "o", value: "/org/freedesktop/DBus" }],
    [HeaderField.DESTINATION, { sig: "s", value: "org.freedesktop.DBus" }],
    [HeaderField.INTERFACE, { sig: "s", value: "org.freedesktop.DBus" }],
    [HeaderField.MEMBER, { sig: "s", value: "Hello" }],
  ]);

  // End-of-header padding just before the body (which is empty).
  msg.writePadding(8);

  await Deno.copy(buf, conn);
}

// deno-fmt-ignore
{
  const buf = new Deno.Buffer();
  const msg = new MessageWriter(buf);
  const sig = "susssasa{sv}i";

  msg.write("y", encodeEndianess(msg.endianness));
  msg.write("y", MessageType.METHOD_CALL);
  msg.write("y", 0); // flags
  msg.write("y", 1); // major protocol version
  const writeBodyLen = msg.writeLater("u"); // byte length of body
  msg.write("u", 2); // serial/cookie
  msg.write("a(yv)", [
    [HeaderField.DESTINATION, { sig: "s", value: "org.freedesktop.Notifications" }],
    [HeaderField.PATH, { sig: "o", value: "/org/freedesktop/Notifications" }],
    [HeaderField.INTERFACE, { sig: "s", value: "org.freedesktop.Notifications" }],
    [HeaderField.MEMBER, { sig: "s", value: "Notify" }],
    [HeaderField.SIGNATURE, { sig: "g", value: sig }],
  ]);
  msg.writePadding(8);

  writeBodyLen(msg.measureLength(() => {
    msg.writeMany(sig, "Deno", 0, "", "", "Hello from Deno", [], new Map(), 5000);
  }));

  await Deno.copy(buf, conn);
}

while (true) await readMessage(conn);
