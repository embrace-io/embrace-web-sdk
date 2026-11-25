/**
 * Converts any value to a string without throwing. `String()` throws for a
 * value with no string conversion, such as `Object.create(null)`, which then
 * becomes `'[object Object]'`.
 */
export const toSafeString = (value: unknown): string => {
  try {
    return String(value);
  } catch {
    try {
      return Object.prototype.toString.call(value);
    } catch {
      // A revoked Proxy throws here too.
      return '';
    }
  }
};
