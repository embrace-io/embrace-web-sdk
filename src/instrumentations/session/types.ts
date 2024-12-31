import {ReadableSpan} from '@opentelemetry/sdk-trace-web';
import {Attributes} from '@opentelemetry/api';
import {KEY_EMB_TYPE, EMB_TYPES} from '../../constants/attributes';

interface SessionSpanAttributes extends Attributes {
  [KEY_EMB_TYPE]: EMB_TYPES.Session;
}

interface SessionSpan extends ReadableSpan {
  attributes: SessionSpanAttributes;
}

export type {SessionSpan, SessionSpanAttributes};
