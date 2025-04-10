import type { Span } from '@opentelemetry/api';
import type { SpanOptions } from '@opentelemetry/api/build/src/trace/SpanOptions';

export interface TraceManager {
  startSpan: (name: string, options?: SpanOptions) => Span | null;
}
