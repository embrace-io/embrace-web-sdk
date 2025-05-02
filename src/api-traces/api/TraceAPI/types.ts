import type { ProxyTraceManager } from '../../manager/index.js';
import type { SpanOptions } from '@opentelemetry/api';
import { type Span, type TimeInput } from '@opentelemetry/api';

export interface TraceAPIArgs {
  proxyTraceManager: ProxyTraceManager;
}

export type PerformanceSpanFailedOptions = {
  code?: PerformanceSpanFailureCode;
  endTime?: TimeInput;
};
export type PerformanceSpanFailureCode = 'failure' | 'user_abandon';

export interface PerformanceSpan extends Span {
  fail: (options?: PerformanceSpanFailedOptions) => void;
}

export type PerformanceSpanOptions = SpanOptions & {
  parentSpan?: Span;
};
