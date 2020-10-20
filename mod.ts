import { Bus } from "./bus.ts";
import { HeaderField, Message } from "./message.ts";

const bus = await Bus.session();

const notifySerial = await bus.send(Message.methodCall({
  destination: "org.freedesktop.Notifications",
  path: "/org/freedesktop/Notifications",
  interface: "org.freedesktop.Notifications",
  member: "Notify",
  body: {
    sig: "susssasa{sv}i",
    values: ["Deno", 0, "", "Hello from Deno", "", [], new Map(), 5000],
  },
}));

for await (const { msg } of bus.incoming()) {
  console.log("\nRECEIVING: %o", msg);
  if (msg.fields.get(HeaderField.REPLY_SERIAL)?.value === notifySerial) {
    console.log("^ got Notify reply");
  }
}
