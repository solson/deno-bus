export function dbg<T>(x: T, msg?: string): T {
  const s = inspect(x);
  if (msg === undefined) {
    console.log("%s", s);
  } else {
    console.log("%s: %s", msg, s);
  }
  return x;
}

export function inspect(x: unknown): string {
  return Deno.inspect(x, { colors: true, depth: 8 });
}
