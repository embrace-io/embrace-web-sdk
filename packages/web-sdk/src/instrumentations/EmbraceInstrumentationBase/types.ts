import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { LimitManagerInternal } from '../../managers/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';

export interface EmbraceInstrumentationBaseArgs<
  ConfigType extends InstrumentationConfig = InstrumentationConfig,
> {
  instrumentationName: string;
  instrumentationVersion: string;
  config: ConfigType;
  perf?: PerformanceManager;
  limitManager?: LimitManagerInternal;
}
