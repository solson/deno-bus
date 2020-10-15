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
