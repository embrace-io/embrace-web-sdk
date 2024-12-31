import {SpanProcessor} from '@opentelemetry/sdk-trace-web';
import {ReadableSpan} from '@opentelemetry/sdk-trace-base/build/src/export/ReadableSpan';
import {
  ATTR_HTTP_REQUEST_METHOD,
  SEMATTRS_HTTP_METHOD,
} from '@opentelemetry/semantic-conventions';
import {Attributes, AttributeValue} from '@opentelemetry/api';
import {EMB_TYPES, KEY_EMB_TYPE} from '../constants/attributes';
import {Span} from '@opentelemetry/sdk-trace-base/build/src/Span';

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

// not used yet, but added for clarity. This is the type for Embrace tagged network spans
// interface EmbraceNetworkSpanAttributes extends Attributes {
//   [KEY_EMB_TYPE]: EMB_TYPES.Network;
// }
// interface EmbraceNetworkSpan extends NetworkSpan {
//   attributes: NetworkSpanAttributes & EmbraceNetworkSpanAttributes;
// }

const isNetworkSpan = (
  span: ReadableSpan | NetworkSpan,
): span is NetworkSpan => {
  return (
    span.attributes[SEMATTRS_HTTP_METHOD] !== undefined ||
    span.attributes[ATTR_HTTP_REQUEST_METHOD] !== undefined
  );
};

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
