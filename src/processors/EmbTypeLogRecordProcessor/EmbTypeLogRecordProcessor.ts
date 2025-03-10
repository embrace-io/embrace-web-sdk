import type { LogRecord } from '@opentelemetry/sdk-logs';
import { type LogRecordProcessor } from '@opentelemetry/sdk-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';

export class EmbTypeLogRecordProcessor implements LogRecordProcessor {
  public onEmit(logRecord: LogRecord) {
    if (!logRecord.attributes[KEY_EMB_TYPE]) {
      logRecord.setAttribute(KEY_EMB_TYPE, EMB_TYPES.SystemLog);
    }
  }

  // no-op
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
