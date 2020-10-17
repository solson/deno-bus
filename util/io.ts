export class PartialReadError extends Deno.errors.UnexpectedEof {
  name = "PartialReadError";
  constructor(partial: number, total: number) {
    super(
      `Encountered unexpected end of file, data only partially read (${partial} out of ${total} bytes)`,
    );
  }
}

export async function readExact(
  r: Deno.Reader,
  buf: Uint8Array,
): Promise<void> {
  let bytesRead = 0;
  while (bytesRead < buf.length) {
    const partial = await r.read(buf.subarray(bytesRead));
    if (partial === null) throw new PartialReadError(bytesRead, buf.length);
    bytesRead += partial;
  }
}

export function readExactSync(r: Deno.ReaderSync, buf: Uint8Array): void {
  let bytesRead = 0;
  while (bytesRead < buf.length) {
    const partial = r.readSync(buf.subarray(bytesRead));
    if (partial === null) throw new PartialReadError(bytesRead, buf.length);
    bytesRead += partial;
  }
}

export async function readNBytes(
  r: Deno.Reader,
  n: number,
): Promise<Uint8Array> {
  const buf = new Uint8Array(n);
  await readExact(r, buf);
  return buf;
}

export function readNBytesSync(r: Deno.ReaderSync, n: number): Uint8Array {
  const buf = new Uint8Array(n);
  readExactSync(r, buf);
  return buf;
}
