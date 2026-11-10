import type { DiagLogger } from '@opentelemetry/api';
import { InMemoryStorage } from './InMemoryStorage/index.ts';

/**
 * Returns the page's `localStorage` or `sessionStorage`, or an in-memory
 * stand-in when the page can't access it. Reading the getter throws a
 * `SecurityError` when the browser blocks storage for the page (cookies
 * blocked for the site, sandboxed iframes), and some webviews return null.
 */
export const getWindowStorageOrInMemory = (
  name: 'localStorage' | 'sessionStorage',
  diag: DiagLogger,
): Storage => {
  let failure: unknown = `${name} is null`;

  try {
    const storage = window[name] as Storage | null;

    if (storage) {
      return storage;
    }
  } catch (error) {
    failure = error;
  }

  diag.warn(
    `${name} is not accessible; keeping its data in memory for this page`,
    String(failure),
  );

  return new InMemoryStorage();
};
