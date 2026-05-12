import type { DiagLogger } from '@opentelemetry/api';

/**
 * Validates `value` against `[min, max]`, returning `defaultValue` (and
 * warning via `diag`) when the value is non-finite or out of range.
 * Returns `defaultValue` silently when `value` is undefined.
 *
 * Despite the name, out-of-range inputs are replaced with `defaultValue`
 * rather than pinned to `min`/`max`. Use this to validate user-supplied
 * config where falling back to a known-good default is safer than
 * silently mutating the value.
 */
export const clampNumber = ({
  diag,
  value,
  defaultValue,
  min,
  max,
}: {
  diag?: DiagLogger;
  value: number | undefined;
  defaultValue: number;
  min: number;
  max: number;
}): number => {
  if (value === undefined) {
    return defaultValue;
  }
  if (!Number.isFinite(value)) {
    diag?.warn(
      `value is not a finite number; falling back to default (${defaultValue.toString()}).`,
    );
    return defaultValue;
  }
  if (value < min || value > max) {
    diag?.warn(
      `value (${value.toString()}) is outside the allowed range ` +
        `[${min.toString()}, ${max.toString()}]; ` +
        `falling back to default (${defaultValue.toString()}).`,
    );
    return defaultValue;
  }
  return value;
};
