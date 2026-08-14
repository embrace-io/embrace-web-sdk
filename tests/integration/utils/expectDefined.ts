/**
 * Narrows a possibly-undefined value for tests reading indexed collections.
 *
 * `noUncheckedIndexedAccess` widens every `requests[0]` to `T | undefined`, but
 * tests almost always assert the length first, so the guard is a type-level
 * formality. Throwing keeps the failure legible instead of surfacing as a
 * `TypeError` on the next property read.
 */
export const expectDefined = <T>(value: T | undefined, label?: string): T => {
  if (value === undefined) {
    throw new Error(`expected ${label ?? 'value'} to be defined`);
  }

  return value;
};
