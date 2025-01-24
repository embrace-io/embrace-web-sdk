import {ReadableSpan} from '@opentelemetry/sdk-trace-web';
import {Attributes} from '@opentelemetry/api';
import {EMB_TYPES, KEY_EMB_TYPE} from '../../constants';

export interface SessionSpanAttributes extends Attributes {
  [KEY_EMB_TYPE]: EMB_TYPES.Session;
}

export interface SessionSpan extends ReadableSpan {
  attributes: SessionSpanAttributes;
}
