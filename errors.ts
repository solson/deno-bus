import { FixedTypeUnknown, typeNames } from "./dbus_types.ts";

export class ValidationError extends Error {
  constructor({ sig, value }: FixedTypeUnknown, expected: string) {
    const name = typeNames[sig];
    const type = typeof value;
    super(`signature "${sig}" (${name}) expected ${expected}, got ${type}`);
  }
}

export class ProtocolError extends Error {}
