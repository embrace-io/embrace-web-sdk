import type { Span, SpanOptions } from '@opentelemetry/api';

export interface TraceManager {
  startPerformanceSpan: (name: string, options?: SpanOptions) => Span | null;
}
