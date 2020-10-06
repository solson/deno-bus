export function dbg<T>(x: T): T {
  console.log("%o", x);
  return x;
}
