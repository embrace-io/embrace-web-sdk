import type { Span, SpanOptions, TimeInput } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import type { ProxyTraceManager } from '../../manager/index.ts';

export interface TraceAPIArgs {
  proxyTraceManager: ProxyTraceManager;
}

export type ExtendedSpanFailureCode = 'failure' | 'user_abandon';

export type ExtendedSpanFailedOptions = {
  code?: ExtendedSpanFailureCode;
  endTime?: TimeInput;
};

/**
 * Exposes the span's current attributes (readonly) without defining all properties of the ReadableSpan interface.
 * Ideally, we create a new interface that merges OpenTelemetry's Span, ReadableSpan and the not-yet-implemented
 * Writable Span described here:
 * https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/sdk.md#additional-span-interfaces
 */
export interface ExtendedSpan extends Span, Pick<ReadableSpan, 'attributes'> {
  removeAttribute: (key: string) => this;
  fail: (options?: ExtendedSpanFailedOptions) => void;
}

export type ExtendedSpanOptions = SpanOptions & {
  /*
   * Parent span to use for this span.
   * It provides an easier way to set the parent span, instead of setting the context as 3rd argument.
   * When sending both `parentSpan` and `context`, the `parentSpan` will take precedence.
   */
  parentSpan?: Span;
};
