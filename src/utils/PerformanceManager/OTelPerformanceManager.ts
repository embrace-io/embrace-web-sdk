import { millisToHrTime, otperformance } from '@opentelemetry/core';
import type { PerformanceClock, PerformanceManager } from './types.js';

export class OTelPerformanceManager implements PerformanceManager {
  private readonly _clock: PerformanceClock;

  public constructor(clock: PerformanceClock = otperformance) {
    this._clock = clock;
  }

  public epochMillisFromOriginOffset = (originOffset: number) =>
    this._clock.timeOrigin + originOffset;

  public getNowHRTime = () => millisToHrTime(this.getNowMillis());

  public getNowMillis = () =>
    this.epochMillisFromOriginOffset(this._clock.now()); // otperformance.now() returns milliseconds since timeOrigin, timeOrigin is the time from epoch to the start of the page load
}
