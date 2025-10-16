import type { SdkLogRecord, LogRecordProcessor } from '@opentelemetry/sdk-logs';
import {
  ATTR_LOG_RECORD_UID,
  ATTR_SESSION_ID,
  ATTR_SESSION_PREVIOUS_ID,
} from '@opentelemetry/semantic-conventions/incubating';
import type { SpanSessionManager } from '../../api-sessions/index.js';
import { generateUUID } from '../../utils/index.js';
import type { IdentifiableSessionLogRecordProcessorArgs } from './types.js';

export class IdentifiableSessionLogRecordProcessor
  implements LogRecordProcessor
{
  private readonly _spanSessionManager: SpanSessionManager;

  public constructor({
    spanSessionManager,
  }: IdentifiableSessionLogRecordProcessorArgs) {
    this._spanSessionManager = spanSessionManager;
  }

  // no-op
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord) {
    logRecord.setAttributes({
      [ATTR_LOG_RECORD_UID]: generateUUID(),
      [ATTR_SESSION_ID]: this._spanSessionManager.getSessionId(),
      [ATTR_SESSION_PREVIOUS_ID]:
        this._spanSessionManager.getPreviousSessionId(),
    });
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
