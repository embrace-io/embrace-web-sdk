import type { DiagLogger } from '@opentelemetry/api';
import type { PerformanceManager } from '../../utils/index.js';
import type { VisibilityStateDocument } from '../../common/index.js';

export interface EmbraceSpanSessionManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  visibilityDoc?: VisibilityStateDocument;
}
