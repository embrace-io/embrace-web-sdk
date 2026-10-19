import type { Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import {
  KEY_EMB_PERF_CLOCK_LAG_MS,
  KEY_EMB_PERF_CLOCK_LAG_START_MS,
} from '../../constants/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import { getPerfClockLagMillis } from '../utils/index.ts';
import type { PerfClockLagSpanProcessorArgs } from './types.ts';

/**
 * PerfClockLagSpanProcessor records how far the performance clock is behind Date.now() when each span
 * starts and when it ends. Different values mean the device slept while the span was open.
 */
export class PerfClockLagSpanProcessor implements SpanProcessor {
  private readonly _perf: PerformanceManager;
  // The start lag is held here and written at onEnding along with the end lag, so that neither
  // attribute takes up room under the span's attribute count limit.
  private readonly _startLags = new WeakMap<Span, number>();

  public constructor({ perf }: PerfClockLagSpanProcessorArgs) {
    this._perf = perf;
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onStart(span: Span): void {
    this._startLags.set(span, getPerfClockLagMillis(this._perf));
  }

  public onEnding(span: Span): void {
    const startLag = this._startLags.get(span);
    if (startLag !== undefined) {
      span.attributes[KEY_EMB_PERF_CLOCK_LAG_START_MS] = startLag;
      this._startLags.delete(span);
    }

    span.attributes[KEY_EMB_PERF_CLOCK_LAG_MS] = getPerfClockLagMillis(
      this._perf,
    );
  }

  public onEnd(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
