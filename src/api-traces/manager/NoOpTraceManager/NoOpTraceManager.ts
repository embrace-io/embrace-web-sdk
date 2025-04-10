import type { Span, SpanOptions } from '@opentelemetry/api';
import type { TraceManager } from '../types.js';

export class NoOpTraceManager implements TraceManager {
  public startSpan(_name: string, _options?: SpanOptions): Span | null {
    return null;
  }
}
