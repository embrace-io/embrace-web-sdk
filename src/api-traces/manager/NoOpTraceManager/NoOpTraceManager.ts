import type { SpanOptions } from '@opentelemetry/api';
import type { TraceManager } from '../index.js';
import type { PerformanceSpan } from '../../api/index.js';

export class NoOpTraceManager implements TraceManager {
  public startPerformanceSpan(
    _name: string,
    _options?: SpanOptions
  ): PerformanceSpan | null {
    return null;
  }
}
