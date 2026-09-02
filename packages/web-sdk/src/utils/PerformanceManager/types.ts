export interface PerformanceManager {
  epochMillisFromOrigin: (originOffset: number) => number;
  getNavigationEntry: () => PerformanceNavigationTiming | null;
  getNowMillis: () => number;
  millisFromZeroTime: (originOffset: number) => number;
  millisFromZeroTimeEpoch: (epochMillis: number) => number;
  getZeroTime: () => number;
}

export interface PerformanceClock {
  now: () => number;
  timeOrigin: number;
  getEntriesByType?: (type: string) => PerformanceEntry[];
}
