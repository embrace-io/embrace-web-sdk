/**
 * Milliseconds from the time origin to the moment the SDK's code first ran on
 * the page. For a CDN install that is script evaluation; for a bundled install
 * it is whenever the host chunk executed.
 */
// Read at module evaluation, before any PerformanceManager exists and before
// initSDK's own `typeof window === 'undefined'` guard ever runs, so this is
// the one site that touches the clock directly and the one that must not
// throw when imported outside a browser (SSR, non-browser test runners).
export const SDK_LOAD_ORIGIN_OFFSET =
  typeof performance === 'undefined' ? 0 : performance.now();
