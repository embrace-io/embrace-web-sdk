import {LogRecord, type LogRecordProcessor} from '@opentelemetry/sdk-logs';
import generateUUID from '../../utils/generateUUID';
import {
  ATTR_LOG_RECORD_UID,
  ATTR_SESSION_ID,
} from '@opentelemetry/semantic-conventions/incubating';
import {SessionProvider} from '@opentelemetry/web-common';

class IdentifiableSessionLogRecordProcessor implements LogRecordProcessor {
  constructor(private _sessionProvider: SessionProvider) {}

  onEmit(logRecord: LogRecord) {
    logRecord.setAttributes({
      [ATTR_LOG_RECORD_UID]: generateUUID(),
      [ATTR_SESSION_ID]: this._sessionProvider.getSessionId(),
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

export default IdentifiableSessionLogRecordProcessor;
