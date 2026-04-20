import type { DiagLogger } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { LimitManagerInternal } from '../../managers/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';

export interface EmbraceInstrumentationBaseArgs<
  ConfigType extends InstrumentationConfig = InstrumentationConfig,
> {
  instrumentationName: string;
  instrumentationVersion: string;
  config: ConfigType;
  diag?: DiagLogger;
  perf?: PerformanceManager;
  limitManager?: LimitManagerInternal;
}
