export function dbg<T>(x: T, msg?: string): T {
  const s = Deno.inspect(x, { colors: true, depth: 8 });
  if (msg === undefined) {
    console.log("%s", s);
  } else {
    console.log("%s: %s", msg, s);
  }
  return x;
}
