// TODO(solson): Add doc comment with example.
export function assertExhaustive(x: never): never {
  throw new Error(`exhaustive code was non-exhaustive, got ${x}`);
}

/**
 * Indicates unfinished code.
 *
 * This can be useful if you are prototyping and are just looking to have your
 * code typecheck.
 */
export function todo(msg?: string): never {
  const err = new Error(
    msg === undefined ? "not yet implemented" : `not yet implemented: ${msg}`,
  );
  // Capture a stack trace from where `todo` was called instead of at the above
  // `Error` constructor.
  Error.captureStackTrace(err, todo);
  throw err;
}
