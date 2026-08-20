/**
 * Milliseconds from the time origin to the moment the SDK's code first ran on
 * the page. For a CDN install that is script evaluation; for a bundled install
 * it is whenever the host chunk executed.
 */
// Read at module evaluation, before any PerformanceManager exists, so this is
// the one site that touches the clock directly. It holds the raw origin offset
// so callers must convert through the manager to reach an epoch.
export const SDK_LOAD_ORIGIN_OFFSET_MILLIS = performance.now();
