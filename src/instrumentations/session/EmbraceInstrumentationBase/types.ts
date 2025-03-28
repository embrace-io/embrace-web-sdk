import type { DiagLogger } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { PerformanceManager } from '../../../utils/index.js';

export interface EmbraceInstrumentationBaseArgs<
  ConfigType extends InstrumentationConfig = InstrumentationConfig,
> {
  instrumentationName: string;
  instrumentationVersion: string;
  config: ConfigType;
  diag?: DiagLogger;
  perf?: PerformanceManager;
}
