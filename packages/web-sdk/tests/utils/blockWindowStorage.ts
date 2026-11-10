/**
 * Replaces the `window.localStorage` or `window.sessionStorage` getter with one
 * that throws a `SecurityError`, as browsers do when storage is blocked for the
 * page, or that returns null, as some webviews do. Returns a function that
 * restores the original getter.
 */
export const blockWindowStorage = (
  name: 'localStorage' | 'sessionStorage',
  behavior: 'throw' | 'null' = 'throw',
): (() => void) => {
  const original = Object.getOwnPropertyDescriptor(window, name);

  Object.defineProperty(window, name, {
    configurable: true,
    get: () => {
      if (behavior === 'null') {
        return null;
      }

      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });

  return () => {
    if (original) {
      Object.defineProperty(window, name, original);
    } else {
      Reflect.deleteProperty(window, name);
    }
  };
};
