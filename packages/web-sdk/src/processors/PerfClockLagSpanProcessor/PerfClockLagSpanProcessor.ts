import type { Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import { KEY_EMB_PERF_CLOCK_LAG_MS } from '../../constants/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import { getPerfClockLagMillis } from '../utils/index.ts';
import type { PerfClockLagSpanProcessorArgs } from './types.ts';

/**
 * PerfClockLagSpanProcessor records how far the performance clock is behind Date.now() when each span ends.
 */
export class PerfClockLagSpanProcessor implements SpanProcessor {
  private readonly _perf: PerformanceManager;

  public constructor({ perf }: PerfClockLagSpanProcessorArgs) {
    this._perf = perf;
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEnding(span: Span): void {
    span.attributes[KEY_EMB_PERF_CLOCK_LAG_MS] = getPerfClockLagMillis(
      this._perf,
    );
  }

  public onStart(this: void): void {
    // do nothing.
  }

  public onEnd(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
