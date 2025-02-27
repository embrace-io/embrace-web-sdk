import { AttributeValue } from '@opentelemetry/api';
import { ATTR_URL_PATH } from '@opentelemetry/semantic-conventions';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import { Span } from '@opentelemetry/sdk-trace-web';
import { EmbraceReadableSpan, EmbraceSpanAttributes } from '../types.js';

interface ViewSpanAttributes extends EmbraceSpanAttributes {
  [KEY_EMB_TYPE]: EMB_TYPES.View;
  [ATTR_URL_PATH]: AttributeValue;
}

type ViewSpan = EmbraceReadableSpan<ViewSpanAttributes>;

export const isViewSpan = (span: Span | ViewSpan): span is ViewSpan =>
  span.attributes[KEY_EMB_TYPE] === EMB_TYPES.View &&
  !!span.attributes[ATTR_URL_PATH];
