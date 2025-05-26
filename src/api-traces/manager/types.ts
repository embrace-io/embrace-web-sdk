import type { ExtendedSpan, ExtendedSpanOptions } from '../api/index.js';

export interface TraceManager {
  startSpan: (
    name: string,
    options?: ExtendedSpanOptions
  ) => ExtendedSpan | null;
}
