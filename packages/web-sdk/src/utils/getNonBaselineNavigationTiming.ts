/**
 * Adds browser features not yet in TypeScript's DOM lib (as of Oct 2025):
 * - deliveryType: Chromium only (experimental) https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/deliveryType
 * - renderBlockingStatus: Chromium only https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/renderBlockingStatus
 * - notRestoredReasons: Limited availability https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming/notRestoredReasons
 */
export type EmbracePerformanceNavigationTiming = PerformanceNavigationTiming & {
  deliveryType?: 'cache' | '';
  renderBlockingStatus?: 'blocking' | 'non-blocking';
  notRestoredReasons?: { reasons?: { reason: string }[] } | null;
};

export const getNonBaselineNavigationTiming = ():
  | EmbracePerformanceNavigationTiming
  | undefined =>
  window.performance.getEntriesByType('navigation')[0] as
    | EmbracePerformanceNavigationTiming
    | undefined;
