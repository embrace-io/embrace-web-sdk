import type { DiagLogger } from '@opentelemetry/api';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import type { VisibilityStateDocument } from '../../common/index.js';
import type { PerformanceManager } from '../../utils/index.js';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.js';
import type { SpanSessionManagerInternal } from '../EmbraceSpanSessionManager/index.js';

export interface EmbraceLogManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  spanSessionManager: SpanSessionManagerInternal;
  limitManager: LimitManagerInternal;
  loggerProvider?: LoggerProvider;
  visibilityDoc?: VisibilityStateDocument;
  storage?: Storage;
}
