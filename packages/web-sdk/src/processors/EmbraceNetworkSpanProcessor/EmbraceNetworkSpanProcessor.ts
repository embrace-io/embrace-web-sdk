import type { Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import { isNetworkSpan } from '../../utils/index.ts';

/**
 * Embrace's API expects network spans to have some specific attributes.
 * This processor checks if a span is a network span and adds them.
 */
export class EmbraceNetworkSpanProcessor implements SpanProcessor {
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  // Read in onEnding because isNetworkSpan depends on the HTTP response status, which is only set at span end.
  public onEnding(span: Span): void {
    if (isNetworkSpan(span)) {
      span.attributes[KEY_EMB_TYPE] = EMB_TYPES.Network;
    }
  }

  public onStart(this: void): void {
    // do nothing.
  }

  public onEnd(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
