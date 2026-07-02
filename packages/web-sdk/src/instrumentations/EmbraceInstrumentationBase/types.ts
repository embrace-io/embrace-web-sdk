import type { DiagLogger } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { LimitManagerInternal } from '../../managers/EmbraceLimitManager/types.ts';
import type { PerformanceManager } from '../../utils/PerformanceManager/types.ts';

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
