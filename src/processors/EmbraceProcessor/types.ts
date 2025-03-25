import type { DiagLogger } from '@opentelemetry/api';

export interface EmbraceProcessorArgs {
  diag?: DiagLogger;
  processorName: string;
}
