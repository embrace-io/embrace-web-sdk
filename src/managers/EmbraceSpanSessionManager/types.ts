import type { DiagLogger } from '@opentelemetry/api';
import type { PerformanceManager } from '../../utils/index.js';

// Useful for testing so that we can pass in a document-like object and change its visibilityState
export interface VisibilityStateDocument {
  visibilityState: DocumentVisibilityState;
}

export interface EmbraceSpanSessionManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  visibilityDoc?: VisibilityStateDocument;
}
