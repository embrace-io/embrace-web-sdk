import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import { KEY_EMB_PERF_CLOCK_LAG_MS } from '../../constants/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import type { PerfClockLagLogRecordProcessorArgs } from './types.ts';

/**
 * PerfClockLagLogRecordProcessor records how far the performance clock is behind Date.now() when each
 * log is emitted.
 */
export class PerfClockLagLogRecordProcessor implements LogRecordProcessor {
  private readonly _perf: PerformanceManager;

  public constructor({ perf }: PerfClockLagLogRecordProcessorArgs) {
    this._perf = perf;
  }

  // no-op
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord): void {
    logRecord.setAttribute(KEY_EMB_PERF_CLOCK_LAG_MS, this._perf.getClockLag());
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
