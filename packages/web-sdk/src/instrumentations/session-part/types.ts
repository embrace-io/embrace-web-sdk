import type { Attributes } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import type { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/attributes.ts';

interface SessionSpanAttributes extends Attributes {
  [KEY_EMB_TYPE]: EMB_TYPES.SessionPart;
}

export interface SessionPartSpan extends ReadableSpan {
  attributes: SessionSpanAttributes;
}
