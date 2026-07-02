import type { DiagLogger } from '@opentelemetry/api';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import type { VisibilityStateDocument } from '../../common/types.ts';
import type { NamespacedStorage } from '../../utils/NamespacedStorage/NamespacedStorage.ts';
import type { PerformanceManager } from '../../utils/PerformanceManager/types.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/types.ts';
import type { UserSessionManagerInternal } from '../EmbraceUserSessionManager/types.ts';

export interface EmbraceLogManagerArgs {
  diag?: DiagLogger;
  perf: PerformanceManager;
  userSessionManager: UserSessionManagerInternal;
  limitManager: LimitManagerInternal;
  loggerProvider?: LoggerProvider;
  visibilityDoc: VisibilityStateDocument;
  storage: NamespacedStorage;
}
