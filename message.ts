import { DBusValue } from "./dbus_types.ts";
import { Endianness } from "./util/encoding.ts";

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

export type RawMessage = {
  endianness: Endianness;
  messageType: MessageType;
  flags: HeaderFlags;
  serial: number;
  fields: Map<HeaderField, DBusValue>;
  body: unknown[];
};
