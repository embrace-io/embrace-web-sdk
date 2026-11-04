import type { LimitManagerInternal } from '../../managers/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';

export interface EmbraceInstrumentationBaseArgs {
  instrumentationName: string;
  instrumentationVersion: string;
  perf?: PerformanceManager;
  limitManager?: LimitManagerInternal;
}
