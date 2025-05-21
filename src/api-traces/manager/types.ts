import type { PerformanceSpan, PerformanceSpanOptions } from '../api/index.js';

export interface TraceManager {
  startSpan: (
    name: string,
    options?: PerformanceSpanOptions
  ) => PerformanceSpan | null;
}
