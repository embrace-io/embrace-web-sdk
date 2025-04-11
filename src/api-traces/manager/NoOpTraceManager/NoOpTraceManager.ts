import type { Span, SpanOptions } from '@opentelemetry/api';
import type { TraceManager } from '../index.js';

export class NoOpTraceManager implements TraceManager {
  public startPerformanceSpan(
    _name: string,
    _options?: SpanOptions
  ): Span | null {
    return null;
  }
}
