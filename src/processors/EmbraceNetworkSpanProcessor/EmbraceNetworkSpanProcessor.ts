import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import { isNetworkSpan } from './types.js';

import {
  ATTR_HTTP_METHOD,
  ATTR_HTTP_RESPONSE_BODY_SIZE,
  ATTR_HTTP_RESPONSE_CONTENT_LENGTH,
  ATTR_HTTP_STATUS_CODE,
  ATTR_HTTP_URL,
} from '@opentelemetry/semantic-conventions/incubating';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_FULL,
} from '@opentelemetry/semantic-conventions';

/**
 * Embrace's API expects network spans to have some specific attributes.
 * This processor checks if a span is a network span and adds them.
 */
export class EmbraceNetworkSpanProcessor implements SpanProcessor {
  onStart(): void {}

  // TODO `onEnd` is not supposed to modify the span. There is a new experimental onEnding api that allows modifying
  //  the span before it is sent to the exporter. This processor should be updated to use that api once that is available
  onEnd(span: ReadableSpan): void {
    if (isNetworkSpan(span)) {
      span.attributes[KEY_EMB_TYPE] = EMB_TYPES.Network;
      span.attributes[ATTR_URL_FULL] = span.attributes[ATTR_HTTP_URL];
      span.attributes[ATTR_HTTP_RESPONSE_STATUS_CODE] =
        span.attributes[ATTR_HTTP_STATUS_CODE];
      span.attributes[ATTR_HTTP_REQUEST_METHOD] =
        span.attributes[ATTR_HTTP_METHOD];
      span.attributes[ATTR_HTTP_RESPONSE_BODY_SIZE] =
        span.attributes[ATTR_HTTP_RESPONSE_CONTENT_LENGTH];
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
