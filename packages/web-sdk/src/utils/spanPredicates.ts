import type { Attributes, AttributeValue } from '@opentelemetry/api';
import type { ReadableSpan, Span } from '@opentelemetry/sdk-trace';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_FULL,
} from '@opentelemetry/semantic-conventions';
import { EMB_TYPES, KEY_EMB_TYPE } from '../constants/index.ts';
import type { SessionPartSpan } from '../instrumentations/index.ts';
import { KEY_EMB_SOFT_NAVIGATION_SOURCE } from '../instrumentations/soft-navigation-performance/SoftNavigationPerformanceInstrumentation/constants.ts';

export interface NetworkSpan extends ReadableSpan {
  attributes: Attributes & { [ATTR_HTTP_REQUEST_METHOD]: AttributeValue };
}

export const isNetworkSpan = (
  span: ReadableSpan | NetworkSpan,
): span is NetworkSpan => {
  if (
    span.attributes[ATTR_HTTP_REQUEST_METHOD] &&
    typeof span.attributes[ATTR_HTTP_RESPONSE_STATUS_CODE] === 'number'
  ) {
    const url = span.attributes[ATTR_URL_FULL];

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
