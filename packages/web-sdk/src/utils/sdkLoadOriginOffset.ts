/**
 * Milliseconds from the time origin to the moment the SDK's code first ran on
 * the page. For a CDN install that is script evaluation; for a bundled install
 * it is whenever the host chunk executed.
 */
// Evaluated at import, before any PerformanceManager or initSDK's window guard,
// so it reads the clock directly and must not throw outside a browser (SSR).
export const SDK_LOAD_ORIGIN_OFFSET =
  typeof performance === 'undefined' ? 0 : performance.now();
