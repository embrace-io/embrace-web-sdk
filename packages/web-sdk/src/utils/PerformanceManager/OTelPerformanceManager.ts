import type { HrTime } from '@opentelemetry/api';
import { hrTimeToMilliseconds, millisToHrTime } from '@opentelemetry/core';
import type { PerformanceClock, PerformanceManager } from './types.ts';

export class OTelPerformanceManager implements PerformanceManager {
  private readonly _clock: PerformanceClock;

  public constructor(clock: PerformanceClock = window.performance) {
    this._clock = clock;
  }

  public epochMillisFromOriginOffset = (originOffset: number) =>
    this._clock.timeOrigin + originOffset;

  public getNowHRTime = () => millisToHrTime(this.getNowMillis());

  public getNowMillis = () =>
    this.epochMillisFromOriginOffset(this._clock.now()); // otperformance.now() returns milliseconds since timeOrigin, timeOrigin is the time from epoch to the start of the page load

  public millisSinceHRTime = (time: HrTime) =>
    this.getNowMillis() - hrTimeToMilliseconds(time);
}
