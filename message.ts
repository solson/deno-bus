import { DBusValue } from "./dbus_types.ts";

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

export class Message<T extends MessageType = MessageType> {
  flags: HeaderFlags = 0;
  fields: Map<HeaderField, DBusValue> = new Map();
  body: unknown[] = [];

  constructor(public type: T) {}

  static methodCall(opts: MethodCallOpts): MethodCall {
    const m = new Message(MessageType.METHOD_CALL);
    if (opts.destination !== undefined) {
      m.fields.set(
        HeaderField.DESTINATION,
        { sig: "s", value: opts.destination },
      );
    }
    m.fields.set(HeaderField.PATH, { sig: "o", value: opts.path });
    if (opts.interface !== undefined) {
      m.fields.set(HeaderField.INTERFACE, { sig: "s", value: opts.interface });
    }
    m.fields.set(HeaderField.MEMBER, { sig: "s", value: opts.member });
    if (opts.body !== undefined) {
      m.fields.set(HeaderField.SIGNATURE, { sig: "g", value: opts.body.sig });
      m.body = opts.body.values;
    }
    return m;
  }
}

export type MethodCall = Message<MessageType.METHOD_CALL>;
export type MethodReturn = Message<MessageType.METHOD_RETURN>;
export type ErrorMsg = Message<MessageType.ERROR>;
export type Signal = Message<MessageType.SIGNAL>;

export type MethodCallOpts = {
  destination?: string;
  path: string;
  interface?: string;
  member: string;
  body?: { sig: string, values: unknown[] };
};
