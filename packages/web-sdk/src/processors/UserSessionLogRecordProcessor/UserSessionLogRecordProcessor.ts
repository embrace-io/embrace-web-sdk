import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import {
  ATTR_LOG_RECORD_UID,
  ATTR_SESSION_ID,
  ATTR_SESSION_PREVIOUS_ID,
} from '@opentelemetry/semantic-conventions/incubating';
import {
  KEY_EMB_SESSION_PART_ID,
  KEY_EMB_USER_SESSION_ID,
  KEY_EMB_USER_SESSION_PREVIOUS_ID,
} from '../../constants/attributes.ts';
import type { UserSessionManagerInternal } from '../../managers/EmbraceUserSessionManager/types.ts';
import { generateUUID } from '../../utils/generateUUID.ts';
import type { UserSessionLogRecordProcessorArgs } from './types.ts';

export class UserSessionLogRecordProcessor implements LogRecordProcessor {
  private readonly _userSessionManager: UserSessionManagerInternal;

  public constructor({
    userSessionManager,
  }: UserSessionLogRecordProcessorArgs) {
    this._userSessionManager = userSessionManager;
  }

  // no-op
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord) {
    const userSessionId = this._userSessionManager.getUserSessionId() ?? '';
    const previousUserSessionId =
      this._userSessionManager.getPreviousUserSessionId() ?? '';

    logRecord.setAttributes({
      [ATTR_LOG_RECORD_UID]: generateUUID(),
      [ATTR_SESSION_ID]: userSessionId,
      [ATTR_SESSION_PREVIOUS_ID]: previousUserSessionId,
      [KEY_EMB_USER_SESSION_ID]: userSessionId,
      [KEY_EMB_USER_SESSION_PREVIOUS_ID]: previousUserSessionId,
      [KEY_EMB_SESSION_PART_ID]:
        this._userSessionManager.getSessionPartId() ?? '',
    });
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
