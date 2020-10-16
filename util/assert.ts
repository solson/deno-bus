// TODO(solson): Add doc comment with example.
export function assertExhaustive(x: never): never {
  throw new Error(`exhaustive code was non-exhaustive, got ${x}`);
}
