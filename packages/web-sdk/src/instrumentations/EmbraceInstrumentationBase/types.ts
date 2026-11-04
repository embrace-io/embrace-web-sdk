import type { LimitManagerInternal } from '../../managers/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';

export interface EmbraceInstrumentationBaseArgs<
  ConfigType extends object = object,
> {
  instrumentationName: string;
  instrumentationVersion: string;
  config: ConfigType;
  perf?: PerformanceManager;
  limitManager?: LimitManagerInternal;
}
