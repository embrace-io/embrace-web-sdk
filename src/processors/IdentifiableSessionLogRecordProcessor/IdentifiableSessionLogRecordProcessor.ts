import { LogRecord, type LogRecordProcessor } from '@opentelemetry/sdk-logs';
import { generateUUID } from '../../utils/index.js';
import {
  ATTR_LOG_RECORD_UID,
  ATTR_SESSION_ID,
} from '@opentelemetry/semantic-conventions/incubating';
import { SpanSessionManager } from '../../api-sessions/index.js';
import { IdentifiableSessionLogRecordProcessorArgs } from './types.js';

export class IdentifiableSessionLogRecordProcessor
  implements LogRecordProcessor
{
  private readonly _spanSessionManager: SpanSessionManager;

  constructor({
    spanSessionManager,
  }: IdentifiableSessionLogRecordProcessorArgs) {
    this._spanSessionManager = spanSessionManager;
  }

  onEmit(logRecord: LogRecord) {
    logRecord.setAttributes({
      [ATTR_LOG_RECORD_UID]: generateUUID(),
      [ATTR_SESSION_ID]: this._spanSessionManager.getSessionId(),
    });
  }

  // no-op
  forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  // no-op
  shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
