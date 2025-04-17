import type { Span, SpanOptions } from '@opentelemetry/api';
import type { PerformanceSpanFailedOptions, TraceManager } from '../index.js';

export class NoOpTraceManager implements TraceManager {
  public startPerformanceSpan(
    _name: string,
    _options?: SpanOptions
  ): Span | null {
    return null;
  }

  public performanceSpanFailed(
    _span: Span | null,
    _options?: PerformanceSpanFailedOptions
  ): void {
    return;
  }
}
