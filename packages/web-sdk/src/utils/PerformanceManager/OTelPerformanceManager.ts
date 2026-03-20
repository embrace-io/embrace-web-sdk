import type { HrTime } from '@opentelemetry/api';
import { hrTimeToMilliseconds, millisToHrTime } from '@opentelemetry/core';
import type { PerformanceClock, PerformanceManager } from './types.ts';

let _pageShowMillis: number | undefined;

export function updatePageShowMillis(epochMs: number): void {
  _pageShowMillis = epochMs;
}

export function _resetPageShowMillisForTesting(): void {
  _pageShowMillis = undefined;
}

export class OTelPerformanceManager implements PerformanceManager {
  private readonly _clock: PerformanceClock;

  public constructor(clock: PerformanceClock = window.performance) {
    this._clock = clock;
  }

  public epochMillisFromOriginOffset = (originOffset: number) =>
    this.getPageStartMillis() + originOffset;

  public getNowHRTime = () => millisToHrTime(this.getNowMillis());

  public getNowMillis = () =>
    this.epochMillisFromOriginOffset(this._clock.now()); // otperformance.now() returns milliseconds since timeOrigin, timeOrigin is the time from epoch to the start of the page load

  public millisSinceHRTime = (time: HrTime) =>
    Math.max(0, this.getNowMillis() - hrTimeToMilliseconds(time));

  public getPageStartMillis = (): number =>
    Math.max(
      this._clock.timeOrigin + this._getNavigationActivationStart(),
      _pageShowMillis ?? 0,
    );

  private _getNavigationActivationStart(): number {
    const entry = this._clock.getEntriesByType?.('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;

    return entry?.activationStart ?? 0;
  }

  // Returns milliseconds elapsed since the SDK's zero time (currently navigation
  // start). When soft-navigation support is added, this method will subtract the
  // reset point so timings remain relative to the soft navigation.
  public millisFromZeroTime = (originOffset: number) => originOffset;
}
