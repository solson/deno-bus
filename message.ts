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

export const headerFieldTypes = {
  [HeaderField.PATH]: "o",
  [HeaderField.INTERFACE]: "s",
  [HeaderField.MEMBER]: "s",
  [HeaderField.ERROR_NAME]: "s",
  [HeaderField.REPLY_SERIAL]: "u",
  [HeaderField.DESTINATION]: "s",
  [HeaderField.SENDER]: "s",
  [HeaderField.SIGNATURE]: "g",
  [HeaderField.UNIX_FDS]: "u",
} as const;

export interface RawMessage {
  type: number;
  flags: number;
  fields: Map<number, DBusValue>;
  body: unknown[];
}

export interface MessageOps {
  toRaw(): RawMessage;
}

export class UnknownMessage implements MessageOps {
  constructor(public raw: RawMessage) {}
  toRaw() {
    return this.raw;
  }
}

export class MethodCall implements MessageOps {
  // extraFlags = 0;
  // extraFields: Map<number, DBusValue> = new Map();

  constructor(
    public destination: string | undefined,
    public path: string,
    public interface_: string | undefined,
    public member: string,
    public body?: { sig: string; values: unknown[] },
  ) {}

  toRaw(): RawMessage {
    const fields = new Map<number, DBusValue>();
    let body: unknown[] = [];

    if (this.destination !== undefined) {
      fields.set(HeaderField.DESTINATION, {
        sig: "s",
        value: this.destination,
      });
    }

    fields.set(HeaderField.PATH, { sig: "o", value: this.path });

    if (this.interface_ !== undefined) {
      fields.set(HeaderField.INTERFACE, { sig: "s", value: this.interface_ });
    }

    fields.set(HeaderField.MEMBER, { sig: "s", value: this.member });

    if (this.body !== undefined) {
      fields.set(HeaderField.SIGNATURE, { sig: "g", value: this.body.sig });
      body = this.body.values;
    }

    // TODO(solson): Use extraFields and extraFlags.
    return { type: MessageType.METHOD_CALL, flags: 0, fields, body };
  }
}

export class MethodReturn implements MessageOps {
  // extraFlags = 0;
  // extraFields: Map<number, DBusValue> = new Map();

  constructor(
    public destination: string | undefined,
    public replySerial: number,
    public body?: { sig: string; values: unknown[] },
  ) {}

  toRaw(): RawMessage {
    const fields = new Map<number, DBusValue>();
    let body: unknown[] = [];

    if (this.destination !== undefined) {
      fields.set(HeaderField.DESTINATION, {
        sig: "s",
        value: this.destination,
      });
    }

    fields.set(HeaderField.REPLY_SERIAL, { sig: "u", value: this.replySerial });

    if (this.body !== undefined) {
      fields.set(HeaderField.SIGNATURE, { sig: "g", value: this.body.sig });
      body = this.body.values;
    }

    // TODO(solson): Use extraFields and extraFlags.
    return { type: MessageType.METHOD_RETURN, flags: 0, fields, body };
  }
}

export class ErrorMsg implements MessageOps {
  // extraFlags = 0;
  // extraFields: Map<number, DBusValue> = new Map();

  constructor(
    public destination: string | undefined,
    public errorName: string,
    public replySerial: number,
    public body?: { sig: string; values: unknown[] },
  ) {}

  toRaw(): RawMessage {
    const fields = new Map<number, DBusValue>();
    let body: unknown[] = [];

    if (this.destination !== undefined) {
      fields.set(HeaderField.DESTINATION, {
        sig: "s",
        value: this.destination,
      });
    }

    fields.set(HeaderField.ERROR_NAME, { sig: "s", value: this.errorName });
    fields.set(HeaderField.REPLY_SERIAL, { sig: "u", value: this.replySerial });

    if (this.body !== undefined) {
      fields.set(HeaderField.SIGNATURE, { sig: "g", value: this.body.sig });
      body = this.body.values;
    }

    // TODO(solson): Use extraFields and extraFlags.
    return { type: MessageType.ERROR, flags: 0, fields, body };
  }
}

export class Signal implements MessageOps {
  // extraFlags = 0;
  // extraFields: Map<number, DBusValue> = new Map();

  constructor(
    public destination: string | undefined,
    public path: string,
    public interface_: string,
    public member: string,
    public body?: { sig: string; values: unknown[] },
  ) {}

  toRaw(): RawMessage {
    const fields = new Map<number, DBusValue>();
    let body: unknown[] = [];

    if (this.destination !== undefined) {
      fields.set(HeaderField.DESTINATION, {
        sig: "s",
        value: this.destination,
      });
    }

    fields.set(HeaderField.PATH, { sig: "o", value: this.path });
    fields.set(HeaderField.INTERFACE, { sig: "s", value: this.interface_ });
    fields.set(HeaderField.MEMBER, { sig: "s", value: this.member });

    if (this.body !== undefined) {
      fields.set(HeaderField.SIGNATURE, { sig: "g", value: this.body.sig });
      body = this.body.values;
    }

    // TODO(solson): Use extraFields and extraFlags.
    return { type: MessageType.SIGNAL, flags: 0, fields, body };
  }
}

export type Message =
  | UnknownMessage
  | MethodCall
  | MethodReturn
  | ErrorMsg
  | Signal;

export type LabeledMessage = {
  msg: Message;
  serial: number;
  sender: string;
};
