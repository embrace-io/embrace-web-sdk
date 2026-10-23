/** Milliseconds since the Unix epoch, on the wall clock (e.g. Date.now()). */
export type AbsoluteTime = number;

/**
 * Milliseconds on the perf clock since a reference point: timeOrigin (e.g. performance.now(),
 * entry.startTime, event.timeStamp), or zero time where the name says so (getOffsetFromZeroTime).
 * Time asleep is not counted on platforms where the perf clock stops during sleep.
 */
export type Offset = number;

export interface OriginSegment {
  // perf offset after which this origin applies: the last check before the
  // drift was noticed, so anything up to it is known to predate the sleep
  from: Offset;
  // epoch timestamp that perf offsets after `from` are relative to
  origin: AbsoluteTime;
}

export interface ClockState {
  segments: OriginSegment[];
  lastCheckedNow: Offset;
  zeroTimeOffset?: Offset;
}

export interface PerformanceManager {
  offsetToAbsoluteTime: (
    originOffset: Offset,
    entryStart?: Offset,
  ) => AbsoluteTime;
  getClockLag: () => number;
  getNavigationEntry: () => PerformanceNavigationTiming | null;
  getNow: () => AbsoluteTime;
  getOffsetFromOrigin: () => Offset;
  getOffsetFromZeroTime: (originOffset?: Offset) => Offset;
  getZeroTime: (entryStart?: Offset) => AbsoluteTime;
  setZeroTimeOffset: (originOffset: Offset) => void;
}

export interface PerformanceClock {
  now: () => Offset;
  timeOrigin: AbsoluteTime;
  getEntriesByType?: (type: string) => PerformanceEntry[];
}
