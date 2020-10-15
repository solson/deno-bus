export class PartialReadError extends Deno.errors.UnexpectedEof {
  name = "PartialReadError";
  partial?: Uint8Array;
  constructor() {
    super("Encountered UnexpectedEof, data only partially read");
  }
}

export async function readExact(
  r: Deno.Reader,
  p: Uint8Array,
): Promise<Uint8Array | null> {
  let bytesRead = 0;
  while (bytesRead < p.length) {
    try {
      const rr = await r.read(p.subarray(bytesRead));
      if (rr === null) {
        if (bytesRead === 0) {
          return null;
        } else {
          throw new PartialReadError();
        }
      }
      bytesRead += rr;
    } catch (err) {
      err.partial = p.subarray(0, bytesRead);
      throw err;
    }
  }
  return p;
}

export function readExactSync(
  r: Deno.ReaderSync,
  p: Uint8Array,
): Uint8Array | null {
  let bytesRead = 0;
  while (bytesRead < p.length) {
    try {
      const rr = r.readSync(p.subarray(bytesRead));
      if (rr === null) {
        if (bytesRead === 0) {
          return null;
        } else {
          throw new PartialReadError();
        }
      }
      bytesRead += rr;
    } catch (err) {
      err.partial = p.subarray(0, bytesRead);
      throw err;
    }
  }
  return p;
}
