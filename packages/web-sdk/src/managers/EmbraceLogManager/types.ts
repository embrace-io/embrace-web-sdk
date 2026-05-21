import type { DiagLogger } from '@opentelemetry/api';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import type { VisibilityStateDocument } from '../../common/index.ts';
import type {
  NamespacedStorage,
  PerformanceManager,
} from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';
import type { UserSessionManagerInternal } from '../EmbraceUserSessionManager/index.ts';

export interface EmbraceLogManagerArgs {
  diag?: DiagLogger;
  perf: PerformanceManager;
  userSessionManager: UserSessionManagerInternal;
  limitManager: LimitManagerInternal;
  loggerProvider?: LoggerProvider;
  visibilityDoc: VisibilityStateDocument;
  storage: NamespacedStorage;
}
