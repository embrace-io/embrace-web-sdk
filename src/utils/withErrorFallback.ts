import type { DiagLogger } from '@opentelemetry/api';

/**
 * Wraps a callback in a try-catch and returns a default value upon failure
 */
export const withErrorFallback =
  <Args extends unknown[], R>(
    fn: (...args: Args) => R,
    defaultValue: R,
    silent = true,
    diag?: DiagLogger
  ) =>
  (...args: Args) => {
    try {
      return fn(...args);
    } catch (e) {
      if (!silent) {
        if (diag) {
          const message = e instanceof Error ? e.message : 'Unknown error.';
          diag.error(message);
        } else {
          console.error(e);
        }
      }
      return defaultValue;
    }
  };
