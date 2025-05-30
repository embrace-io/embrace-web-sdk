import type { PerformanceManager } from '../../utils/index.js';
import type { SpanSessionManagerInternal } from '../EmbraceSpanSessionManager/index.js';

export interface EmbraceLogManagerArgs {
  perf?: PerformanceManager;
  spanSessionManager: SpanSessionManagerInternal;
}
