import type { DiagLogger } from '@opentelemetry/api';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import type { VisibilityStateDocument } from '../../common/index.ts';
import type { EmbraceStorage, PerformanceManager } from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';
import type { SpanSessionManagerInternal } from '../EmbraceSpanSessionManager/index.ts';

export interface EmbraceLogManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  spanSessionManager: SpanSessionManagerInternal;
  limitManager: LimitManagerInternal;
  loggerProvider?: LoggerProvider;
  visibilityDoc?: VisibilityStateDocument;
  storage?: EmbraceStorage;
}
