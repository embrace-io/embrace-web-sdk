import type { ProxyTraceManager } from '../../manager/index.js';
import type { SpanOptions } from '@opentelemetry/api';
import { type Span, type TimeInput } from '@opentelemetry/api';

export interface TraceAPIArgs {
  proxyTraceManager: ProxyTraceManager;
}

export type EmbraceExtendedSpanFailureCode = 'failure' | 'user_abandon';

export type EmbraceExtendedSpanFailedOptions = {
  code?: EmbraceExtendedSpanFailureCode;
  endTime?: TimeInput;
};

export interface EmbraceExtendedSpan extends Span {
  fail: (options?: EmbraceExtendedSpanFailedOptions) => void;
}

export type EmbraceExtendedSpanOptions = SpanOptions & {
  parentSpan?: Span;
};
