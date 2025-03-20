import type { HrTime } from '@opentelemetry/api';

export interface PerformanceManager {
  getNowHRTime: () => HrTime;
  epochMillisFromOriginOffset: (originOffset: number) => number;
  getNowMillis: () => number;
}
