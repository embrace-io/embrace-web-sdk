import type { HrTime } from '@opentelemetry/api';
import { hrTimeToMilliseconds, millisToHrTime } from '@opentelemetry/core';
import type { PerformanceClock, PerformanceManager } from './types.ts';

let _zeroTimeMillis: number | undefined;

export function updateZeroTimeMillis(epochMs: number): void {
  _zeroTimeMillis = epochMs;
}

export function _resetZeroTimeMillisForTesting(): void {
  _zeroTimeMillis = undefined;
}

export class OTelPerformanceManager implements PerformanceManager {
  private readonly _clock: PerformanceClock;
  private navigationEntry: PerformanceNavigationTiming | null = null;

  public constructor(clock: PerformanceClock = window.performance) {
    this._clock = clock;
  }

  // originOffset (entry.startTime, event.timeStamp, performance.now()) is always
  // "milliseconds since timeOrigin" by spec, a fixed relationship for the page's
  // whole life, so converting to an epoch timestamp is just adding timeOrigin
  // back in. getZeroTime() answers a different question (how long the user has
  // been looking at the current view) and has no bearing on this conversion.
  public epochMillisFromOrigin = (originOffset: number) =>
    this._clock.timeOrigin + originOffset;

  public getNowHRTime = () => millisToHrTime(this.getNowMillis());

  public getNowMillis = () => this.epochMillisFromOrigin(this._clock.now());

  public millisSinceHRTime = (time: HrTime) =>
    Math.max(0, this.getNowMillis() - hrTimeToMilliseconds(time));

  /**
   * To measure the way a user experienced a metric, we measure metrics relative to the time the user
   * started viewing the current page or view. On prerendered pages, this is activationStart. On bfcache
   * restores and soft navigations, this is the time of the restore or navigation. On all other pages
   * this value will be zero.
   */
  public getZeroTime = (): number =>
    Math.max(
      this._clock.timeOrigin + this._getNavigationActivationStart(),
      _zeroTimeMillis ?? 0,
    );

  private _getNavigationEntry(): PerformanceNavigationTiming | null {
    if (this.navigationEntry) {
      return this.navigationEntry;
    }

    const [entry] = this._clock.getEntriesByType?.('navigation') ?? [];

    if (entry) {
      this.navigationEntry = entry as PerformanceNavigationTiming;

      return this.navigationEntry;
    }

    return null;
  }

  private _getNavigationActivationStart(): number {
    const entry = this._getNavigationEntry();
    return entry?.activationStart ?? 0;
  }

  // originOffset is relative to timeOrigin, but zero time may sit later than
  // timeOrigin (activation start, bfcache restore). Subtract that gap to rebase the
  // offset onto zero time; clamp to 0 for anything that predates zero time (e.g.
  // prerendering activity captured before activationStart).
  public millisFromZeroTime = (originOffset: number) =>
    Math.max(0, originOffset - (this.getZeroTime() - this._clock.timeOrigin));
}
