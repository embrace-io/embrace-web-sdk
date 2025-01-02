import {SpanProcessor} from '@opentelemetry/sdk-trace-web';
import {EMB_TYPES, KEY_EMB_TYPE} from '../../constants/attributes';
import {Span} from '@opentelemetry/sdk-trace-base/build/src/Span';
import {isNetworkSpan} from './types';

/**
 * Embrace's API expects network spans to have some specific attributes.
 * This processor checks if a span is a network span and adds them.
 */
class EmbraceNetworkSpanProcessor implements SpanProcessor {
  onStart(span: Span): void {
    if (isNetworkSpan(span)) {
      span.setAttribute(KEY_EMB_TYPE, EMB_TYPES.Network);
    }
  }

  onEnd(): void {}

  forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}

export default EmbraceNetworkSpanProcessor;
