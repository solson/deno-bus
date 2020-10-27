import { Bus } from "./bus.ts";
import { MethodCall, MethodReturn } from "./message.ts";
import { inspect } from "./util/debug.ts";

const notifyMsg = new MethodCall(
  "org.freedesktop.Notifications",
  "/org/freedesktop/Notifications",
  "org.freedesktop.Notifications",
  "Notify",
  {
    sig: "susssasa{sv}i",
    values: ["Deno", 0, "", "Hello from Deno", "", [], new Map(), 5000],
  },
);

const bus = await Bus.session();
const notifySerial = await bus.send(notifyMsg);

for await (const { msg, serial, sender } of bus.events()) {
  console.log("\nRECEIVING(%s/%i): %s", sender, serial, inspect(msg));
  if (msg instanceof MethodReturn && msg.replySerial === notifySerial) {
    console.log("^ got Notify reply");
  }
}
