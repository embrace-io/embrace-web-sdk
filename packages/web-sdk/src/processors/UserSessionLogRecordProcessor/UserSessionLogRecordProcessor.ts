import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import {
  ATTR_SESSION_ID,
  ATTR_SESSION_PREVIOUS_ID,
} from '@opentelemetry/semantic-conventions/incubating';
import {
  KEY_EMB_SESSION_PART_ID,
  KEY_EMB_USER_SESSION_ID,
  KEY_EMB_USER_SESSION_PREVIOUS_ID,
} from '../../constants/index.ts';
import type { UserSessionLifecycleManager } from '../../managers/EmbraceUserSessionManager/index.ts';
import type { UserSessionLogRecordProcessorArgs } from './types.ts';

export class UserSessionLogRecordProcessor implements LogRecordProcessor {
  private readonly _userSessionManager: UserSessionLifecycleManager;
  private readonly _diag: DiagLogger;

  public constructor({
    userSessionManager,
  }: UserSessionLogRecordProcessorArgs) {
    this._userSessionManager = userSessionManager;
    this._diag = diag.createComponentLogger({
      namespace: 'UserSessionLogRecordProcessor',
    });
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord) {
    try {
      const ids = this._userSessionManager.getSessionIds();
      // Spec 2.1: events without a part id must not have a session id.
      // IdentifiableSessionLogRecordProcessor runs before this processor
      // and stamps emb.session_part_id when a part is active; gate on it here.
      const hasPartId = !!logRecord.attributes[KEY_EMB_SESSION_PART_ID];

      logRecord.setAttributes({
        [KEY_EMB_USER_SESSION_ID]: hasPartId ? ids.userSessionId : '',
        [KEY_EMB_USER_SESSION_PREVIOUS_ID]: hasPartId
          ? ids.userSessionPreviousId
          : '',
      });

      // `session.id`: customer-set values on the record win. Otherwise honor
      // the setSessionId() override regardless of part state (customer-owned),
      // and fall back to the SDK user session id only when a part is active.
      if (logRecord.attributes[ATTR_SESSION_ID] === undefined) {
        const sessionId =
          ids.sessionIdOverride !== null
            ? ids.sessionIdOverride
            : hasPartId
              ? ids.userSessionId
              : '';
        logRecord.setAttributes({ [ATTR_SESSION_ID]: sessionId });
      }
      if (logRecord.attributes[ATTR_SESSION_PREVIOUS_ID] === undefined) {
        logRecord.setAttributes({
          [ATTR_SESSION_PREVIOUS_ID]: hasPartId ? ids.sessionPreviousId : '',
        });
      }
    } catch (e) {
      // Stamp empty strings so the four-attribute contract holds even when
      // the manager throws; downstream consumers see a deterministic shape.
      const fill: Record<string, string> = {};
      if (logRecord.attributes[KEY_EMB_USER_SESSION_ID] === undefined) {
        fill[KEY_EMB_USER_SESSION_ID] = '';
      }
      if (
        logRecord.attributes[KEY_EMB_USER_SESSION_PREVIOUS_ID] === undefined
      ) {
        fill[KEY_EMB_USER_SESSION_PREVIOUS_ID] = '';
      }
      if (logRecord.attributes[ATTR_SESSION_ID] === undefined) {
        fill[ATTR_SESSION_ID] = '';
      }
      if (logRecord.attributes[ATTR_SESSION_PREVIOUS_ID] === undefined) {
        fill[ATTR_SESSION_PREVIOUS_ID] = '';
      }
      logRecord.setAttributes(fill);
      this._diag.error('Error applying user-session attributes to log', e);
    }
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
