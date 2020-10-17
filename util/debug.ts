export function dbg<T>(x: T, msg?: string): T {
  if (msg === undefined) {
    console.log("%o", x);
  } else {
    console.log("%s: %o", msg, x);
  }
  return x;
}
