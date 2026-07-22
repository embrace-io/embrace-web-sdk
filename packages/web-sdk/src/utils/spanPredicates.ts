import type { Attributes, AttributeValue } from '@opentelemetry/api';
import type { ReadableSpan, Span } from '@opentelemetry/sdk-trace';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_FULL,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_HTTP_URL,
} from '@opentelemetry/semantic-conventions';
import { EMB_TYPES, KEY_EMB_TYPE } from '../constants/index.ts';
import type { SessionPartSpan } from '../instrumentations/index.ts';
import { KEY_EMB_SOFT_NAVIGATION_SOURCE } from '../instrumentations/soft-navigation-performance/SoftNavigationPerformanceInstrumentation/constants.ts';

// NetworkSpanAttributesDeprecated and NetworkSpanAttributesNewest are the types for network spans attributes based on the otel conventions.
// The SEMATTRS_HTTP_METHOD attribute is deprecated in favor of ATTR_HTTP_REQUEST_METHOD,
// but the web auto instrumentation still uses the deprecated attribute, so we will support both
// the latest semconv and the deprecated ones for ease of use.
interface NetworkSpanAttributesDeprecated extends Attributes {
  [SEMATTRS_HTTP_METHOD]: AttributeValue;
}

interface NetworkSpanAttributesNewest extends Attributes {
  [ATTR_HTTP_REQUEST_METHOD]: AttributeValue;
}

type NetworkSpanAttributes =
  | NetworkSpanAttributesNewest
  | NetworkSpanAttributesDeprecated;

export interface NetworkSpan extends ReadableSpan {
  attributes: NetworkSpanAttributes;
}

export const isNetworkSpan = (
  span: ReadableSpan | NetworkSpan,
): span is NetworkSpan => {
  if (
    (span.attributes[ATTR_HTTP_REQUEST_METHOD] ||
      span.attributes[SEMATTRS_HTTP_METHOD]) &&
    (typeof span.attributes[ATTR_HTTP_RESPONSE_STATUS_CODE] === 'number' ||
      typeof span.attributes[SEMATTRS_HTTP_STATUS_CODE] === 'number')
  ) {
    const url =
      span.attributes[ATTR_URL_FULL] ?? span.attributes[SEMATTRS_HTTP_URL];

    return typeof url === 'string' && url.includes('://');
  }

  return false;
};

export const isSessionPartSpan = (
  span: ReadableSpan | SessionPartSpan,
): span is SessionPartSpan =>
  span.attributes[KEY_EMB_TYPE] === EMB_TYPES.SessionPart;

export const isSoftNavigationSpan = (span: ReadableSpan | Span): boolean =>
  span.attributes[KEY_EMB_SOFT_NAVIGATION_SOURCE] !== undefined;
