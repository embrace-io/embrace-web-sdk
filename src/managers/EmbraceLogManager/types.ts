import type { DiagLogger } from '@opentelemetry/api';
import type { PerformanceManager } from '../../utils/index.js';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.js';
import type { SpanSessionManagerInternal } from '../EmbraceSpanSessionManager/index.js';

export interface EmbraceLogManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  spanSessionManager: SpanSessionManagerInternal;
  limitManager: LimitManagerInternal;
}
