import {ReadableSpan} from '@opentelemetry/sdk-trace-web';
import {Attributes} from '@opentelemetry/api';
import {KEY_EMB_TYPE, VALUE_EMB_SESSION} from '../../constants/attributes';

interface SessionSpanAttributes extends Attributes {
  [KEY_EMB_TYPE]: typeof VALUE_EMB_SESSION;
}

interface SessionSpan extends ReadableSpan {
  attributes: SessionSpanAttributes;
}

export type {SessionSpan, SessionSpanAttributes};
