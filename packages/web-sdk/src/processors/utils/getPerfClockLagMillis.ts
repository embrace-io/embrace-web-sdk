import type { PerformanceManager } from '../../utils/index.ts';

/**
 * Returns how far the performance clock is behind Date.now(), rounded to whole milliseconds.
 * Both clocks advance together while the device is awake; on platforms where performance.now()
 * pauses during sleep the difference grows by the time slept since the page loaded.
 */
export const getPerfClockLagMillis = (perf: PerformanceManager): number =>
  Math.round(Date.now() - perf.getNowMillis());
