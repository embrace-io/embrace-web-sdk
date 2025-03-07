import { Attributes, AttributeValue } from '@opentelemetry/api';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_FULL,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_HTTP_URL,
} from '@opentelemetry/semantic-conventions';
import { ReadableSpan } from '@opentelemetry/sdk-trace-web';

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

interface NetworkSpan extends ReadableSpan {
  attributes: NetworkSpanAttributes;
}

const SCHEME_RE = /.+:\/\/.+/;

export const isNetworkSpan = (
  span: ReadableSpan | NetworkSpan
): span is NetworkSpan => {
  if (
    (span.attributes[ATTR_HTTP_REQUEST_METHOD] ||
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      span.attributes[SEMATTRS_HTTP_METHOD]) &&
    (span.attributes[ATTR_HTTP_RESPONSE_STATUS_CODE] ||
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      span.attributes[SEMATTRS_HTTP_STATUS_CODE])
  ) {
    const url =
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      span.attributes[ATTR_URL_FULL] ?? span.attributes[SEMATTRS_HTTP_URL];

    return !!(url && typeof url === 'string' && SCHEME_RE.exec(url));
  }

  return false;
};

// not used yet, but added for clarity. This is the type for Embrace tagged network spans
// interface EmbraceNetworkSpanAttributes extends Attributes {
//   [KEY_EMB_TYPE]: EMB_TYPES.Network;
// }
// interface EmbraceNetworkSpan extends NetworkSpan {
//   attributes: NetworkSpanAttributes & EmbraceNetworkSpanAttributes;
// }
