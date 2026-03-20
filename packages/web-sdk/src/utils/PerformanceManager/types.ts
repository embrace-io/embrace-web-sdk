import type { HrTime } from '@opentelemetry/api';

export interface PerformanceManager {
  getNowHRTime: () => HrTime;
  epochMillisFromOriginOffset: (originOffset: number) => number;
  getNowMillis: () => number;
  millisSinceHRTime: (time: HrTime) => number;
  millisFromZeroTime: (originOffset: number) => number;
  getPageStartMillis: () => number;
}

export interface PerformanceClock {
  now: () => number;
  timeOrigin: number;
  getEntriesByType?: (type: string) => PerformanceEntry[];
}
