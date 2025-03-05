import { Attributes, AttributeValue } from '@opentelemetry/api';
import { KEY_EMB_TYPE } from '../constants/index.js';
import { ReadableSpan } from '@opentelemetry/sdk-trace-web';

export interface EmbraceSpanAttributes extends Attributes {
  [KEY_EMB_TYPE]: AttributeValue;
}

export interface EmbraceReadableSpan<
  Attributes extends EmbraceSpanAttributes = EmbraceSpanAttributes,
> extends ReadableSpan {
  attributes: Attributes;
}
