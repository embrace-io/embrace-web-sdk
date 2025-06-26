import type {
  Attributes,
  Span,
  SpanOptions,
  TimeInput,
} from '@opentelemetry/api';
import type { ProxyTraceManager } from '../../manager/index.js';

export interface TraceAPIArgs {
  proxyTraceManager: ProxyTraceManager;
}

export type ExtendedSpanFailureCode = 'failure' | 'user_abandon';

export type ExtendedSpanFailedOptions = {
  code?: ExtendedSpanFailureCode;
  endTime?: TimeInput;
};

export interface ExtendedSpan extends Span {
  /**
   * Exposing the span's current attributes provides similar functionality to OpenTelemetry's ReadableSpan,
   * without requiring full implementation of the ReadableSpan interface. This is marked as readonly to prevent
   * accidental modification of the attributes, and to align with OpenTelemetry's ReadableSpan interface.
   *
   * Ideally, we create a new interface that merges Span, ReadableSpan and the not-yet-implemented Writable Span
   * described here:
   * https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/sdk.md#additional-span-interfaces
   */
  readonly attributes: Attributes;
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
