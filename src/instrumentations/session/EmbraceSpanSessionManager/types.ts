import type { DiagLogger } from '@opentelemetry/api';
import type { PerformanceManager } from '../../../utils/index.js';

export interface EmbraceSpanSessionManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
}
