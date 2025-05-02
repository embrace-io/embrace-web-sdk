import type { PerformanceSpan, PerformanceSpanOptions } from '../api/index.js';

export interface TraceManager {
  startPerformanceSpan: (
    name: string,
    options?: PerformanceSpanOptions
  ) => PerformanceSpan | null;
}
