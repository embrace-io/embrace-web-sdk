import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import { isNetworkSpan } from './types.js';

import {
  ATTR_HTTP_REQUEST_BODY_SIZE,
  ATTR_HTTP_RESPONSE_BODY_SIZE,
} from '@opentelemetry/semantic-conventions/incubating';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_FULL,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_REQUEST_CONTENT_LENGTH,
  SEMATTRS_HTTP_RESPONSE_CONTENT_LENGTH,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_HTTP_URL,
} from '@opentelemetry/semantic-conventions';

/**
 * Embrace's API expects network spans to have some specific attributes.
 * This processor checks if a span is a network span and adds them.
 */
export class EmbraceNetworkSpanProcessor implements SpanProcessor {
  public onStart(this: void): void {
    // do nothing.
  }

  // TODO `onEnd` is not supposed to modify the span. There is a new experimental onEnding api that allows modifying
  //  the span before it is sent to the exporter. This processor should be updated to use that api once that is available
  public onEnd(span: ReadableSpan): void {
    if (isNetworkSpan(span)) {
      span.attributes[KEY_EMB_TYPE] = EMB_TYPES.Network;

      /*
        Fallback on deprecated attribute names in case the span is using those instead of the latest ones

        The current versions of @opentelemetry/instrumentation-xml-http-request and @opentelemetry/instrumentation-fetch
        that we're getting from @opentelemetry/auto-instrumentations-web are using these, once we update we'll remove
        this fallback and only support a single version of the semantic convention
       */
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      span.attributes[ATTR_URL_FULL] ??= span.attributes[SEMATTRS_HTTP_URL];
      span.attributes[ATTR_HTTP_RESPONSE_STATUS_CODE] ??=
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        span.attributes[SEMATTRS_HTTP_STATUS_CODE];
      span.attributes[ATTR_HTTP_REQUEST_METHOD] ??=
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        span.attributes[SEMATTRS_HTTP_METHOD];
      span.attributes[ATTR_HTTP_RESPONSE_BODY_SIZE] ??=
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        span.attributes[SEMATTRS_HTTP_RESPONSE_CONTENT_LENGTH];
      span.attributes[ATTR_HTTP_REQUEST_BODY_SIZE] ??=
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        span.attributes[SEMATTRS_HTTP_REQUEST_CONTENT_LENGTH];
    }
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
