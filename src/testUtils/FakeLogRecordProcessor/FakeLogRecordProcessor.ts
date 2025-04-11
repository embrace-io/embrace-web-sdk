import type { LogRecord } from '@opentelemetry/sdk-logs';
import { type LogRecordProcessor } from '@opentelemetry/sdk-logs';

export class FakeLogRecordProcessor implements LogRecordProcessor {
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: LogRecord) {
    logRecord.setAttributes({
      fake: 'my-attr',
    });
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
