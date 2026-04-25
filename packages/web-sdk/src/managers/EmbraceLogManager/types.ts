import type { DiagLogger } from '@opentelemetry/api';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import type { SessionPartManager } from '../../api-sessions/index.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';

export interface EmbraceLogManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  sessionPartManager: SessionPartManager;
  limitManager: LimitManagerInternal;
  loggerProvider?: LoggerProvider;
  visibilityDoc?: VisibilityStateDocument;
  storage?: Storage;
}
