import type { DiagLogger } from '@opentelemetry/api';
import type { PerformanceManager } from '../../utils/index.js';

export interface EmbraceProcessorArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  processorName: string;
}
