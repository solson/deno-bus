import { Bus } from "./bus.ts";

const bus = await Bus.session();

const { msg, sender, serial } = await bus.methodCall(
  "org.freedesktop.Notifications",
  "/org/freedesktop/Notifications",
  "org.freedesktop.Notifications",
  "Notify",
  {
    sig: "susssasa{sv}i",
    values: ["Deno", 0, "", "Hello from Deno", "", [], new Map(), 5000],
  },
);

console.log("\nNotify() reply\nRECEIVING(%s/%i): %o", sender, serial, msg);

bus.close();
