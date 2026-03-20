import type { HrTime } from '@opentelemetry/api';

export interface PerformanceManager {
  getNowHRTime: () => HrTime;
  epochMillisFromZeroTime: (originOffset: number) => number;
  getNowMillis: () => number;
  millisSinceHRTime: (time: HrTime) => number;
  millisFromZeroTime: (originOffset: number) => number;
  getZeroTime: () => number;
}

export interface PerformanceClock {
  now: () => number;
  timeOrigin: number;
  getEntriesByType?: (type: string) => PerformanceEntry[];
}
