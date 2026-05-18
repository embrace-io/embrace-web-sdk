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
} from '../../constants/index.ts';
import type { UserSessionManagerInternal } from '../../managers/EmbraceUserSessionManager/index.ts';
import { generateUUID } from '../../utils/index.ts';
import type { IdentifiableSessionLogRecordProcessorArgs } from './types.ts';

export class IdentifiableSessionLogRecordProcessor
  implements LogRecordProcessor
{
  private readonly _userSessionManager: UserSessionManagerInternal;

  public constructor({
    userSessionManager,
  }: IdentifiableSessionLogRecordProcessorArgs) {
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
