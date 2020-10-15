// TODO(solson): In the upcoming TypeScript 4.1, I will be able to precisely
// type the possible DBus signature strings and their corresponding TS types.
export type DBusValue = {
  sig: string;
  value: unknown;
};

/** See https://dbus.freedesktop.org/doc/dbus-specification.html#basic-types. */
export type FixedType =
  | { sig: "y"; value: number }
  | { sig: "b"; value: boolean }
  | { sig: "n"; value: number }
  | { sig: "q"; value: number }
  | { sig: "i"; value: number }
  | { sig: "u"; value: number }
  | { sig: "x"; value: bigint }
  | { sig: "t"; value: bigint }
  | { sig: "d"; value: number }
  | { sig: "h"; value: never };

// interface DBusByte extends DBusValue {
//   sig: "y";
//   value: number;
// }
// interface DBusBoolean extends DBusValue {
//   sig: "b";
//   value: boolean;
// }
// type MyType = DBusByte | DBusBoolean;
// type MyTypeVal<Sig extends "y" | "b"> = Extract<MyType, { sig: Sig }>["value"];

export type DBusType = FixedTypeSig | StringTypeSig | "v" | "a" | "r";

export type IntTypeSig = "y" | "n" | "q" | "i" | "u" | "x" | "t";
export type FixedTypeSig = FixedType["sig"];
export type FixedTypeUnknown = { sig: FixedTypeSig; value: unknown };

// // deno-fmt-ignore
// type FixedTypeSigFor<T> =
//   Extract<FixedType, { value: T }>["sig"];

// deno-fmt-ignore
export type FixedTypeVal<Sig extends FixedTypeSig> =
  Extract<FixedType, { sig: Sig }>["value"];

export const typeNames: Record<DBusType, string> = {
  "y": "byte",
  "b": "boolean",
  "n": "int16",
  "q": "uint16",
  "i": "int32",
  "u": "uint32",
  "x": "int64",
  "t": "uint64",
  "d": "double",
  "h": "unixFd",
  "s": "string",
  "o": "objectPath",
  "g": "signature",
  "v": "variant",
  "a": "array",
  "r": "struct",
};

export const fixedTypeSizes: Record<FixedTypeSig, number> = {
  "y": 1,
  "b": 4,
  "n": 2,
  "q": 2,
  "i": 4,
  "u": 4,
  "x": 8,
  "t": 8,
  "d": 8,
  "h": 4,
};

export const integerTypeRanges: {
  [K in IntTypeSig]: [min: FixedTypeVal<K>, max: FixedTypeVal<K>];
} = {
  "y": [0, 2 ** 8 - 1],
  "n": [-(2 ** 7), 2 ** 7 - 1],
  "q": [0, 2 ** 16 - 1],
  "i": [-(2 ** 15), 2 ** 15 - 1],
  "u": [0, 2 ** 32 - 1],
  "x": [-(2n ** 63n), 2n ** 63n - 1n],
  "t": [0n, 2n ** 64n - 1n],
};

export function isFixedTypeSig(sig: string): sig is FixedTypeSig {
  return sig in fixedTypeSizes;
}

export function validateFixed(v: FixedTypeUnknown): asserts v is FixedType {
  switch (v.sig) {
    case "y":
    case "n":
    case "q":
    case "i":
    case "u": {
      if (typeof v.value !== "number") throw new ValidationError(v, "number");
      const [min, max] = integerTypeRanges[v.sig];
      if (v.value < min || v.value > max) {
        throw new RangeError(
          `"${v.sig}" (${
            typeNames[v.sig]
          }) value must be between ${min} and ${max}`,
        );
      }
      break;
    }
    case "x":
    case "t": {
      if (typeof v.value !== "bigint") throw new ValidationError(v, "bigint");
      const [min, max] = integerTypeRanges[v.sig];
      if (v.value < min || v.value > max) {
        throw new RangeError(
          `"${v.sig}" (${
            typeNames[v.sig]
          }) value must be between ${min} and ${max}`,
        );
      }
      break;
    }
    case "b":
      if (typeof v.value !== "boolean") throw new ValidationError(v, "boolean");
      break;
    case "d":
      if (typeof v.value !== "number") throw new ValidationError(v, "number");
      break;
  }
}

export class ValidationError extends Error {
  constructor({ sig, value }: FixedTypeUnknown, expected: string) {
    const name = typeNames[sig];
    const type = typeof value;
    super(`signature "${sig}" (${name}) expected ${expected}, got ${type}`);
  }
}

/** See https://dbus.freedesktop.org/doc/dbus-specification.html#basic-types. */
export type StringTypeSig = "s" | "o" | "g";

export function isStringTypeSig(sig: string): sig is StringTypeSig {
  return sig === "s" || sig === "o" || sig === "g";
}

export type DBusType2 =
  | { type: FixedTypeSig | StringTypeSig | "v" }
  | { type: "a"; elemType: DBusType2 }
  | { type: "r"; fieldTypes: DBusType2[] }
  | { type: "e"; keyType: DBusType2; valueType: DBusType2 };
