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
import type { UserSessionManagerInternal } from '../../managers/EmbraceUserSessionManager/index.ts';
import type { UserSessionLogRecordProcessorArgs } from './types.ts';

export class UserSessionLogRecordProcessor implements LogRecordProcessor {
  private readonly _userSessionManager: UserSessionManagerInternal;
  private readonly _diag: DiagLogger;
  // Empty-string fallback rate-limit: log once per distinct part bucket.
  private _lastFailurePartId: string | null = null;

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
      const userSessionId = this._userSessionManager.getUserSessionId() ?? '';
      const userSessionPreviousId =
        this._userSessionManager.getPreviousUserSessionId() ?? '';
      const userSessionIdOverride =
        this._userSessionManager.getUserSessionIdOverride();
      // Spec 2.1: events without a part id must not have a session id.
      const hasPartId = !!logRecord.attributes[KEY_EMB_SESSION_PART_ID];

      logRecord.setAttributes({
        [KEY_EMB_USER_SESSION_ID]: hasPartId ? userSessionId : '',
        [KEY_EMB_USER_SESSION_PREVIOUS_ID]: hasPartId
          ? userSessionPreviousId
          : '',
      });

      if (logRecord.attributes[ATTR_SESSION_ID] === undefined) {
        const effectiveSessionId =
          userSessionIdOverride !== null
            ? userSessionIdOverride
            : hasPartId
              ? userSessionId
              : '';
        logRecord.setAttributes({
          [ATTR_SESSION_ID]: effectiveSessionId,
        });
      }
      if (logRecord.attributes[ATTR_SESSION_PREVIOUS_ID] === undefined) {
        logRecord.setAttributes({
          [ATTR_SESSION_PREVIOUS_ID]: hasPartId ? userSessionPreviousId : '',
        });
      }
    } catch (e) {
      // Stamp every attribute the export contract requires so a manager
      // throw doesn't leave the record with a partial shape.
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
      const failurePartId =
        typeof logRecord.attributes[KEY_EMB_SESSION_PART_ID] === 'string'
          ? (logRecord.attributes[KEY_EMB_SESSION_PART_ID] as string)
          : '';
      if (this._lastFailurePartId !== failurePartId) {
        this._lastFailurePartId = failurePartId;
        this._diag.error('Error applying user-session attributes to log', e);
      }
    }
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
