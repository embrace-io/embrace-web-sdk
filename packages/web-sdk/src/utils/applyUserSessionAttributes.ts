import type { Attributes } from '@opentelemetry/api';
import type { LogAttributes } from '@opentelemetry/api-logs';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import {
  KEY_EMB_SESSION_PART_ID,
  KEY_EMB_USER_SESSION_ID,
  KEY_EMB_USER_SESSION_PREVIOUS_ID,
} from '../constants/index.ts';
import type { SpanSessionManagerInternal } from '../managers/EmbraceSpanSessionManager/index.ts';

// If attributes already carry emb.session_part_id / emb.user_session_id (stamped
// at span onStart), prefer those over the manager's current values so the span
// keeps its start-time session even if the user session ends before it closes.
export const createUserSessionAttributes = (
  attributes: LogAttributes | Attributes,
  manager: SpanSessionManagerInternal,
): Attributes => {
  const partIdAttr = attributes[KEY_EMB_SESSION_PART_ID];
  const partId =
    typeof partIdAttr === 'string'
      ? partIdAttr
      : (manager.getSessionPartId() ?? '');
  // Spec 2.1: events without a part id must not have a session id.
  const hasPartId = partId !== '';

  const userSessionIdAttr = attributes[KEY_EMB_USER_SESSION_ID];
  const userSessionId =
    typeof userSessionIdAttr === 'string'
      ? userSessionIdAttr
      : hasPartId
        ? (manager.getUserSessionId() ?? '')
        : '';

  const userSessionPreviousIdAttr =
    attributes[KEY_EMB_USER_SESSION_PREVIOUS_ID];
  const userSessionPreviousId =
    typeof userSessionPreviousIdAttr === 'string'
      ? userSessionPreviousIdAttr
      : hasPartId
        ? (manager.getPreviousUserSessionId() ?? '')
        : '';

  const userSessionIdOverride = manager.getUserSessionIdOverride();

  const result: Attributes = {
    [KEY_EMB_SESSION_PART_ID]: partId,
    [KEY_EMB_USER_SESSION_ID]: userSessionId,
    [KEY_EMB_USER_SESSION_PREVIOUS_ID]: userSessionPreviousId,
  };
  if (attributes[ATTR_SESSION_ID] === undefined) {
    result[ATTR_SESSION_ID] = userSessionIdOverride ?? userSessionId;
  }
  return result;
};

// Direct mutation rather than setAttributes: per OTel SDK convention,
// setAttributes is a no-op once a span has ended.
export const applyUserSessionAttributesToSpan = (
  span: ReadableSpan,
  manager: SpanSessionManagerInternal,
): void => {
  Object.assign(
    span.attributes as Attributes,
    createUserSessionAttributes(span.attributes, manager),
  );
};
