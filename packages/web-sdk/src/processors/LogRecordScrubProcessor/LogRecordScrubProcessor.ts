import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type { AttributeScrubber } from '../../common/types.ts';
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

  public onEmit(logRecord: SdkLogRecord) {
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
