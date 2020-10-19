export enum Endianness {
  LE,
  BE,
}

export function nativeEndian(): Endianness {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setInt16(0, 0xFF, true);
  return new Int16Array(buf)[0] === 0xFF ? Endianness.LE : Endianness.BE;
}

export function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function decodeUtf8(b: Uint8Array): string {
  // TODO(solson): Figure out how to check for invalid UTF-8.
  return new TextDecoder().decode(b);
}
