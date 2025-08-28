import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

// PerformanceObserverCallback typing does not include the 3rd options argument but this should
// be available as per https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/PerformanceObserver#dropped_buffer_entries
export type PerformanceObserverCallbackOptions = {
  droppedEntriesCount: number;
};
export type PerformanceObserverCallbackWithOptions = (
  entries: PerformanceObserverEntryList,
  observer: PerformanceObserver,
  options?: PerformanceObserverCallbackOptions
) => void;

export type NetworkInstrumentationArgs = {
  ignoreUrls?: Array<string | RegExp>;
  // Useful for testing so that we can construct a PerformanceObserver where the entries surfaced are controlled by
  // the test spec
  performanceObserverBuilder?: (
    callback: PerformanceObserverCallbackWithOptions
  ) => PerformanceObserver | undefined;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
