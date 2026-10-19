import type { EmbracePerformanceNavigationTiming } from './getNonBaselineNavigationTiming.ts';
import { getNonBaselineNavigationTiming } from './getNonBaselineNavigationTiming.ts';

// Only the top-level document's own reasons are read; nested iframe reasons
// (the `children` field) aren't relevant to instrumentation attributes.
export const getBfcacheNotRestoredReasons = (
  performanceNavigationTiming:
    | EmbracePerformanceNavigationTiming
    | undefined = getNonBaselineNavigationTiming(),
): string[] | undefined => {
  // eslint-disable-next-line baseline-js/use-baseline -- diagnostic-only attribute, omitted where unsupported
  const notRestoredReasons = performanceNavigationTiming?.notRestoredReasons;
  return notRestoredReasons?.reasons?.map((r) => r.reason);
};
