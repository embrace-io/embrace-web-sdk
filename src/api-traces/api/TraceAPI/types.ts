import type { ProxyTraceManager } from '../../manager/index.js';
import type { SpanOptions } from '@opentelemetry/api';
import { type Span, type TimeInput } from '@opentelemetry/api';

export interface TraceAPIArgs {
  proxyTraceManager: ProxyTraceManager;
}

export type ExtendedSpanFailureCode = 'failure' | 'user_abandon';

export type ExtendedSpanFailedOptions = {
  code?: ExtendedSpanFailureCode;
  endTime?: TimeInput;
};

export interface ExtendedSpan extends Span {
  fail: (options?: ExtendedSpanFailedOptions) => void;
}

export type ExtendedSpanOptions = SpanOptions & {
  parentSpan?: Span;
};
