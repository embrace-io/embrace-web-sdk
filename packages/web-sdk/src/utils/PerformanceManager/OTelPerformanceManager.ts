import type {
  AbsoluteTime,
  ClockState,
  Offset,
  PerformanceClock,
  PerformanceManager,
} from './types.ts';

// Past this much disagreement with Date.now(), the perf clock is treated as
// having stopped (the machine slept) or the wall clock as having been changed.
export const DRIFT_THRESHOLD_MS = 1000;
// Bounds the origin history on tabs that live through many sleeps. The first
// segment is always kept, so entries from the initial page load keep timeOrigin.
const MAX_ORIGIN_SEGMENTS = 100;
const clockStates = new WeakMap<PerformanceClock, ClockState>();

const getClockState = (clock: PerformanceClock): ClockState => {
  let state = clockStates.get(clock);

  if (!state) {
    state = {
      segments: [{ from: 0, origin: clock.timeOrigin }],
      lastCheckedNow: clock.now(),
    };
    clockStates.set(clock, state);
  }

  return state;
};

export class OTelPerformanceManager implements PerformanceManager {
  private readonly _clock: PerformanceClock;
  private readonly _wallNow: () => AbsoluteTime;
  // Shared with every other manager on the same clock, so a write here (zero time,
  // a new origin segment) is seen by all of them.
  private readonly _sharedClockState: ClockState;
  private navigationEntry: PerformanceNavigationTiming | null = null;

  public constructor(
    clock: PerformanceClock = window.performance,
    wallNow: () => AbsoluteTime = () => Date.now(),
  ) {
    this._clock = clock;
    this._wallNow = wallNow;
    this._sharedClockState = getClockState(clock);
  }

  /**
   * On macOS, Linux, Android and iOS performance.now() stops while the machine sleeps but
   * Date.now() does not, so timeOrigin + performance.now() falls behind by the time slept.
   * When the two disagree, a new origin segment anchored to the wall clock starts at the
   * last check. Entries that started before it keep the origin they were taken under.
   * Called on every read; initSDK also calls it on page lifecycle events so the segment
   * boundary is close to the sleep.
   */
  public checkDrift = (): void => {
    const perfNow = this._clock.now();
    const wallNow = this._wallNow();
    const { segments } = this._sharedClockState;
    const current = segments[segments.length - 1];

    if (Math.abs(current.origin + perfNow - wallNow) > DRIFT_THRESHOLD_MS) {
      segments.push({
        from: this._sharedClockState.lastCheckedNow,
        origin: wallNow - perfNow,
      });

      if (segments.length > MAX_ORIGIN_SEGMENTS) {
        segments.splice(1, 1);
      }
    }

    this._sharedClockState.lastCheckedNow = perfNow;
  };

  /**
   * Converts a perf offset to epoch milliseconds, using the origin in effect when the entry
   * started. A sleep moves the origin, so converting every timing of one entry with the same
   * origin keeps the entry's duration.
   *
   * @param originOffset - Milliseconds since timeOrigin, e.g. entry.startTime or event.timeStamp.
   * @param entryStart - The startTime of the entry that originOffset belongs to. Pass it when
   * converting any of the entry's other timings. Defaults to originOffset.
   */
  public offsetToAbsoluteTime = (
    originOffset: Offset,
    entryStart: Offset = originOffset,
  ): AbsoluteTime => {
    this.checkDrift();

    return this._originAt(entryStart) + originOffset;
  };

  /**
   * The current time in epoch milliseconds. Anchored to the wall clock, sub-millisecond, and
   * monotonic between corrections.
   */
  public getNow = (): AbsoluteTime => {
    this.checkDrift();

    const { segments } = this._sharedClockState;

    return segments[segments.length - 1].origin + this._clock.now();
  };

  /**
   * How far origin + performance.now() is behind Date.now(), in whole milliseconds, ignoring any
   * corrections. About 0 while awake, it grows by the time slept since origin was read.
   *
   * @param origin - Defaults to the timeOrigin read when the clock state was created: Safari moves
   * performance.timeOrigin forward after a sleep, so the live value would hide the lag. A span
   * passes Date.now() - performance.now() as read when it started, to count only the time slept
   * since then.
   */
  public getClockLag = (
    origin: AbsoluteTime = this._sharedClockState.segments[0].origin,
  ): number => Math.round(this._wallNow() - (origin + this._clock.now()));

  /**
   * Records when the current view started. Every manager on the same clock sees it.
   *
   * @param originOffset - Milliseconds since timeOrigin at which the view started, e.g. the
   * event.timeStamp of a pageshow or soft navigation.
   */
  public setZeroTimeOffset = (originOffset: Offset): void => {
    this._sharedClockState.zeroTimeOffset = originOffset;
  };

  /**
   * To measure the way a user experienced a metric, we measure metrics relative to the time the user
   * started viewing the current page or view. On prerendered pages, this is activationStart. On bfcache
   * restores and soft navigations, this is the time of the restore or navigation. On all other pages
   * this value is timeOrigin.
   *
   * @param entryStart - The startTime of an entry to convert with that entry's origin, so a span
   * from zero time to the entry lasts exactly getOffsetFromZeroTime(entry.startTime). Defaults to
   * zero time itself.
   */
  public getZeroTime = (entryStart?: Offset): AbsoluteTime => {
    const zeroTimeOffset = this._getZeroTimeOffset();

    return this.offsetToAbsoluteTime(
      zeroTimeOffset,
      entryStart ?? zeroTimeOffset,
    );
  };

  /**
   * The page's navigation timing entry, or null when the browser has not recorded one yet. The
   * entry is cached once found: it is live (the browser updates its fields in place), so it never
   * serves stale timings.
   */
  public getNavigationEntry = (): PerformanceNavigationTiming | null => {
    if (this.navigationEntry) {
      return this.navigationEntry;
    }

    const [entry] = this._clock.getEntriesByType?.('navigation') ?? [];

    if (entry) {
      this.navigationEntry = entry as PerformanceNavigationTiming;

      return this.navigationEntry;
    }

    return null;
  };

  /**
   * Milliseconds from timeOrigin to now on the perf clock, i.e. performance.now(). It leaves out
   * time asleep, so it is only comparable with other perf offsets.
   */
  public getOffsetFromOrigin = (): Offset => this._clock.now();

  /**
   * Milliseconds from zero time to originOffset. Both are perf offsets, so this is a pure perf
   * difference and leaves out time asleep. Clamped to 0 for anything that predates zero time
   * (e.g. prerendering activity captured before activationStart).
   *
   * @param originOffset - Milliseconds since timeOrigin, e.g. entry.startTime. Defaults to now.
   */
  public getOffsetFromZeroTime = (
    originOffset: Offset = this._clock.now(),
  ): Offset => Math.max(0, originOffset - this._getZeroTimeOffset());

  private _originAt(originOffset: Offset): AbsoluteTime {
    let { origin } = this._sharedClockState.segments[0];

    for (const segment of this._sharedClockState.segments) {
      if (segment.from >= originOffset) {
        break;
      }

      origin = segment.origin;
    }

    return origin;
  }

  private _getZeroTimeOffset(): Offset {
    return Math.max(
      this._getNavigationActivationStart(),
      this._sharedClockState.zeroTimeOffset ?? 0,
    );
  }

  private _getNavigationActivationStart(): Offset {
    const entry = this.getNavigationEntry();
    // eslint-disable-next-line baseline-js/use-baseline -- only prerendered pages have a nonzero value, and prerendering only exists where this is supported
    return entry?.activationStart ?? 0;
  }
}
