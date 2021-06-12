import { BufReader } from "https://deno.land/std@0.98.0/io/bufio.ts";
import { join } from "https://deno.land/std@0.98.0/path/mod.ts";
import { writeAll } from "https://deno.land/std@0.98.0/io/util.ts";
import {
  ErrorMsg,
  LabeledMessage,
  Message,
  MethodCall,
  MethodReturn,
} from "./message.ts";
import { MessageReader } from "./message_reader.ts";
import { MessageWriter } from "./message_writer.ts";
import { encodeUtf8, Endianness, nativeEndian } from "./util/encoding.ts";

export function getSessionBusAddr(): string {
  const addr = Deno.env.get("DBUS_SESSION_BUS_ADDRESS");
  if (addr !== undefined) return addr;

  // TODO(solson): We need to DBus-path-escape the XDG_RUNTIME_DIR path. Copy
  // from https://github.com/systemd/systemd/blob/4fbf39926e60fbe597969edfb1ed664fcb58e0d0/src/libsystemd/sd-bus/bus-internal.c#L288-L312.
  const run = Deno.env.get("XDG_RUNTIME_DIR");
  if (run !== undefined) return `unix:path=${join(run, "bus")}`;

  throw new Error("Cannot determine session bus address");
}

// TODO(solson): Proper DBus address handling.
export type Addr = string;

export type ConnectionOptions = {
  addr: Addr;
  name: string;
  endianness?: Endianness;
};

type ReplyCallbacks = {
  resolve: (m: LabeledMessage) => void;
  reject: (m: LabeledMessage) => void;
};

let sessionBus: Bus | undefined = undefined;

export class Bus {
  #nextSerial = 1;
  #conn: Deno.Conn | undefined;
  #readLoop: Promise<never> | undefined;
  #replyCallbacks: Map<number, ReplyCallbacks> = new Map();

  readonly addr: Addr;
  readonly name: string;
  readonly endianness: Endianness;
  readonly uniqueName: string | undefined;

  private get conn(): Deno.Conn {
    if (this.#conn === undefined) {
      throw new Error(`DBus connection '${this.name}' is not started yet`);
    }
    return this.#conn;
  }

  private nextSerial(): number {
    // TODO(solson): Handle overflow.
    return this.#nextSerial++;
  }

  constructor(opts: ConnectionOptions) {
    this.addr = opts.addr;
    this.name = opts.name;
    this.endianness = opts.endianness ?? nativeEndian();
  }

  static async session(): Promise<Bus> {
    if (sessionBus === undefined) {
      sessionBus = new Bus({ addr: getSessionBusAddr(), name: "session" });
      await sessionBus.start();
    }
    return sessionBus;
  }

  async start(): Promise<void> {
    if (this.#conn !== undefined) {
      throw new Error(`DBus connection '${this.name}' already started`);
    }
    await this.connect();
    await this.authenticate();
    this.#readLoop = this.readLoop();
    await this.hello();
  }

  private async connect(): Promise<void> {
    if (!this.addr.startsWith("unix:path=")) {
      throw new Error(`Cannot handle DBus addres ${this.addr}`);
    }
    this.#conn = await Deno.connect({
      transport: "unix",
      // TODO(solson): We should actually parse bus addresses.
      path: this.addr.slice(10),
    });
  }

  close() {
    this.#conn?.close();
  }

  private async authenticate(): Promise<void> {
    await writeAll(
      this.conn,
      // TODO(solson): Figure out reliable way to authenticate.
      // libdbus, gdbus, qdbus, python-dbus:
      encodeUtf8("\0AUTH EXTERNAL 31303030\r\nBEGIN\r\n"),
      // sd-bus, dbus-broker:
      // encodeUtf8("\0AUTH EXTERNAL\r\nDATA\r\nBEGIN\r\n"),
    );

    // TODO(solson): Actually parse and validate SASL response.
    const response = await BufReader.create(this.conn).readString("\n");
    if (response === null) throw new Error("no auth response from server");
    if (!response.startsWith("OK ")) throw new Error("authentication error");
    console.log(`server auth response: ${response.trimEnd()}`);
  }

  private async hello(): Promise<void> {
    const { msg, serial, sender } = await this.methodCall(
      "org.freedesktop.DBus",
      "/org/freedesktop/DBus",
      "org.freedesktop.DBus",
      "Hello",
    );
    console.log("\nHello() reply\nRECEIVING(%s/%i): %o", sender, serial, msg);
  }

  async send(msg: Message): Promise<number> {
    const serial = this.nextSerial();
    console.log("\nSENDING(%i): %o", serial, msg);
    const buf = MessageWriter.encode(msg, serial, this.endianness);
    await Deno.copy(buf, this.conn);
    return serial;
  }

  async methodCall(
    destination: string | undefined,
    path: string,
    interface_: string | undefined,
    member: string,
    body?: { sig: string; values: unknown[] },
  ): Promise<LabeledMessage> {
    const msg = new MethodCall(destination, path, interface_, member, body);
    const serial = await this.send(msg);
    const reply = new Promise<LabeledMessage>((resolve, reject) => {
      this.#replyCallbacks.set(serial, { resolve, reject });
    });

    // TODO(solson): Remove the `!`
    return Promise.race([this.#readLoop!, reply]);
  }

  private async readLoop(): Promise<never> {
    while (true) {
      const { msg, sender, serial } = await MessageReader.read(this.conn);
      if (msg instanceof MethodReturn || msg instanceof ErrorMsg) {
        const callbacks = this.#replyCallbacks.get(msg.replySerial);
        if (callbacks !== undefined) {
          this.#replyCallbacks.delete(msg.replySerial);
          const { resolve, reject } = callbacks;
          if (msg instanceof MethodReturn) resolve({ msg, sender, serial });
          if (msg instanceof ErrorMsg) reject({ msg, sender, serial });
        } else {
          console.log(
            "\nunhandled reply\nRECEIVING(%s/%i): %o",
            sender,
            serial,
            msg,
          );
        }
      } else {
        console.log("\nunhandled\nRECEIVING(%s/%i): %o", sender, serial, msg);
      }
    }
  }
}
