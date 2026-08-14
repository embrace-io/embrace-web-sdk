import type { DiagLogger } from '@opentelemetry/api';

export function isEntryTypeSupported(type: string): boolean {
  return (
    typeof PerformanceObserver !== 'undefined' &&
    (PerformanceObserver.supportedEntryTypes?.includes(type) ?? false)
  );
}

/**
 * Creates a PerformanceObserver for the specified entry type if supported, and starts observing.
 * Returns the observer instance, or null if the entry type is not supported or if an error occurs.
 *
 * Each entry is passed individually to `processEntry`. Errors thrown by `processEntry` are caught
 * and logged via `diag` (if provided) so that one bad entry does not block the rest.
 *
 * Note: "buffered" defaults to true, so the observer receives entries that were recorded before it
 * was created. Callers may override it, and should when a replay of an unfinished entry would be
 * mistaken for the final one.
 * buffered: true is not supported when observing multiple entry types, so if you need to observe
 * multiple types, you should create separate observers for each type with buffered: true.
 * See https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/observe#entrytypes
 */
export function createPerformanceObserver<T extends PerformanceEntry>(
  type: string,
  processEntry: (entry: T) => void,
  options?: PerformanceObserverInit & { diag?: DiagLogger },
): PerformanceObserver | null {
  const { diag, ...observeOptions } = options ?? {};

  if (!isEntryTypeSupported(type)) {
    diag?.debug(`${type} not supported, skipping observer`);
    return null;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as T[]) {
        try {
          processEntry(entry);
        } catch (e) {
          diag?.error(`error processing ${type} entry`, e);
        }
      }
    });
    observer.observe({ type, buffered: true, ...observeOptions });
    return observer;
  } catch {
    return null;
  }
}
