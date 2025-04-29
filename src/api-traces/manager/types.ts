import type { SpanOptions } from '@opentelemetry/api';
import type { PerformanceSpan } from '../api/index.js';

export interface TraceManager {
  startPerformanceSpan: (
    name: string,
    options?: SpanOptions
  ) => PerformanceSpan | null;
}
