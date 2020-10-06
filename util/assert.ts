// TODO(solson): Add doc comment with example.
export function assertExhaustive(x: never): never {
  throw new Error(`switch statement was not exhaustive: ${x}`);
}
