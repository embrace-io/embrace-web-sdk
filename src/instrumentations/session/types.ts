import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import {
  EmbraceReadableSpan,
  EmbraceSpanAttributes,
} from '../../processors/types.js';

export interface SessionSpanAttributes extends EmbraceSpanAttributes {
  [KEY_EMB_TYPE]: EMB_TYPES.Session;
}

export type SessionSpan = EmbraceReadableSpan<SessionSpanAttributes>;
