import type { Span, SpanOptions, TimeInput } from '@opentelemetry/api';

export interface TraceManager {
  startPerformanceSpan: (name: string, options?: SpanOptions) => Span | null;
  performanceSpanFailed: (
    span: Span | null,
    options?: PerformanceSpanFailedOptions
  ) => void;
}

export type PerformanceSpanFailedOptions = {
  code?: PerformanceSpanFailureCode;
  endTime?: TimeInput;
};
export type PerformanceSpanFailureCode = 'failure' | 'user_abandon';
