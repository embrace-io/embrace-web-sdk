export interface PerformanceManager {
  epochMillisFromOrigin: (originOffset: number) => number;
  getNowMillis: () => number;
  millisFromZeroTime: (originOffset: number) => number;
  getZeroTime: () => number;
}

export interface PerformanceClock {
  now: () => number;
  timeOrigin: number;
  getEntriesByType?: (type: string) => PerformanceEntry[];
}
