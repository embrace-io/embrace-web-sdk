import type { Context, TextMapSetter } from '@opentelemetry/api';
import { defaultTextMapGetter, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { KEY_EMB_W3C_TRACEPARENT } from '../../constants/attributes.ts';

export class EmbraceW3CTraceContextPropagator extends W3CTraceContextPropagator {
  public override inject(
    context: Context,
    carrier: unknown,
    setter: TextMapSetter,
  ) {
    super.inject(context, carrier, setter);

    // Add the injected Traceparent header as an attribute to the span in the current
    // context if both are available
    const span = trace.getSpan(context);
    if (span) {
      const traceparent =
        carrier instanceof Headers
          ? carrier.get('traceparent')
          : defaultTextMapGetter.get(carrier, 'traceparent');
      if (traceparent) {
        span.setAttribute(KEY_EMB_W3C_TRACEPARENT, traceparent);
      }
    }
  }
}
