import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';

export class FakeLogRecordProcessor implements LogRecordProcessor {
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord) {
    logRecord.setAttributes({
      fake: 'my-attr',
    });
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
