import type { PerformanceManager } from '../../utils/index.js';
import type { SpanSessionManagerInternal } from '../EmbraceSpanSessionManager/index.js';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.js';

export interface EmbraceLogManagerArgs {
  perf?: PerformanceManager;
  spanSessionManager: SpanSessionManagerInternal;
  limitManager: LimitManagerInternal;
}
