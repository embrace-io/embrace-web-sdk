import type { DiagLogger } from '@opentelemetry/api';

/**
 * Creates a proxy that wraps all method calls in try-catch.
 * On error, logs via diag and returns the NoOp manager's value.
 *
 * @param target - The object to wrap (typically a ProxyManager)
 * @param noOpFallback - A NoOp implementation to get fallback return values
 * @param diag - Logger for error reporting
 * @param excludeMethods - Methods to exclude from wrapping (e.g., internal methods)
 */
export function createSafeProxy<T extends object, F extends object>(
  target: T,
  noOpFallback: F,
  diag: DiagLogger,
  excludeMethods: Set<string> = new Set(),
): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);

      if (typeof value !== 'function') {
        return value;
      }

      if (excludeMethods.has(prop as string)) {
        return value;
      }

      return (...args: unknown[]) => {
        try {
          return (value as (...args: unknown[]) => unknown).apply(obj, args);
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          diag.error(`${String(prop)}: ${message}`);

          // Get fallback from NoOp manager
          const fallbackMethod = (noOpFallback as Record<string, unknown>)[
            prop as string
          ];
          if (typeof fallbackMethod === 'function') {
            return (fallbackMethod as (...args: unknown[]) => unknown).apply(
              noOpFallback,
              args,
            );
          }
          return undefined;
        }
      };
    },
  });
}
