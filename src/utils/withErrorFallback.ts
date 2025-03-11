/**
 * Wraps a callback in a try-catch and returns a default value upon failure
 */
export const withErrorFallback =
  <Args extends unknown[], R>(
    fn: (...args: Args) => R,
    defaultValue: R,
    silent = true
  ) =>
  (...args: Args) => {
    try {
      return fn(...args);
    } catch (e) {
      if (!silent) {
        console.error(e);
      }
      return defaultValue;
    }
  };
