import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import type { Attributes } from '@opentelemetry/api';
import type { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';

export interface SessionSpanAttributes extends Attributes {
  [KEY_EMB_TYPE]: EMB_TYPES.Session;
}

export interface SessionSpan extends ReadableSpan {
  attributes: SessionSpanAttributes;
}
