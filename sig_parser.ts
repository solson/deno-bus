import { DBusType2, isFixedTypeSig, isStringTypeSig } from "./dbus_types.ts";

class SigParser {
  #src: string;
  #pos: number;

  constructor(src: string, pos: number = 0) {
    this.#src = src;
    this.#pos = pos;
  }

  parseSig(): DBusType2 {
    const sig = this.#parseNextSig();
    if (this.#pos !== this.#src.length) {
      throw new RangeError(
        `unexpected trailing characters '${this.#src.slice(this.#pos)}'`,
      );
    }
    return sig;
  }

  parseSigs(): DBusType2[] {
    return this.#parseSigsUntil("");
  }

  #parseNextSig(): DBusType2 {
    const c = this.#next();
    if (isFixedTypeSig(c) || isStringTypeSig(c) || c === "v") {
      return { type: c };
    } else if (c === "a" && this.#peek() === "{") {
      this.#pos++;
      const types = this.#parseSigsUntil("}");
      if (types.length !== 2) {
        throw new RangeError(
          `expected 2 signatures in dictionary, got ${types.length}`,
        );
      }
      // TODO(solson): Check that keyType is a basic type.
      return { type: "e", keyType: types[0], valueType: types[1] };
    } else if (c === "a") {
      const elemType = this.#parseNextSig();
      return { type: "a", elemType };
    } else if (c === "(") {
      const fieldTypes = this.#parseSigsUntil(")");
      return { type: "r", fieldTypes };
    } else if (c === "{") {
      throw new RangeError("unknown type '{' (did you mean 'a{'?)");
    } else {
      throw new RangeError(`invalid DBus signature: ${c}`);
    }
  }

  #parseSigsUntil(end: string): DBusType2[] {
    const types: DBusType2[] = [];
    while (this.#peek() !== end) {
      types.push(this.#parseNextSig());
    }
    this.#pos++;
    return types;
  }

  #next(): string {
    return this.#src.charAt(this.#pos++);
  }

  #peek(): string {
    return this.#src.charAt(this.#pos);
  }
}

export function parseSig(src: string): DBusType2 {
  return new SigParser(src).parseSig();
}

export function parseSigs(src: string): DBusType2[] {
  return new SigParser(src).parseSigs();
}
