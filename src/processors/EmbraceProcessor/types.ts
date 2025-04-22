import type { DiagLogger } from '@opentelemetry/api';
import type { SpanSessionManager } from '../../api-sessions/index.js';

export interface EmbraceProcessorArgs {
  diag?: DiagLogger;
  spanSessionManager?: SpanSessionManager;
  processorName: string;
}
