export function isEntryTypeSupported(type: string): boolean {
  return (
    typeof PerformanceObserver !== 'undefined' &&
    (PerformanceObserver.supportedEntryTypes?.includes(type) ?? false)
  );
}

export function createPerformanceObserver<T extends PerformanceEntry>(
  type: string,
  callback: (entries: T[]) => void,
  options?: PerformanceObserverInit,
): PerformanceObserver | null {
  if (!isEntryTypeSupported(type)) {
    return null;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      callback(list.getEntries() as T[]);
    });
    observer.observe({ type, buffered: true, ...options });
    return observer;
  } catch {
    return null;
  }
}
