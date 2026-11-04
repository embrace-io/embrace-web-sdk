import type {
  LogRecordProcessor,
  ReadWriteLogRecord,
} from '@opentelemetry/sdk-logs';
import type { AttributeScrubber } from '../../common/index.ts';
import type { LogRecordScrubProcessorArgs } from './types.ts';

export class LogRecordScrubProcessor implements LogRecordProcessor {
  private readonly _attributeScrubbers: AttributeScrubber[];

  public constructor({ attributeScrubbers }: LogRecordScrubProcessorArgs) {
    this._attributeScrubbers = attributeScrubbers;
  }

  // no-op
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: ReadWriteLogRecord) {
    this._attributeScrubbers.forEach((scrubber) => {
      const value = logRecord.attributes[scrubber.key];
      if (value && typeof value === 'string') {
        logRecord.setAttribute(scrubber.key, scrubber.scrub(value));
      }
    });
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
