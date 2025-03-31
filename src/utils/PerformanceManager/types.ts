import type { HrTime } from '@opentelemetry/api';

export interface PerformanceManager {
  getNowHRTime: () => HrTime;
  epochMillisFromOriginOffset: (originOffset: number) => number;
  getNowMillis: () => number;
}

export interface PerformanceClock {
  now: () => number;
  timeOrigin: number;
}
