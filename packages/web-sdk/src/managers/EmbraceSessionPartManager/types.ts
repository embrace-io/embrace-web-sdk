import type { DiagLogger } from '@opentelemetry/api';
import type { VisibilityStateDocument } from '../../common/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';
import type { UserSessionLifecycleManager } from '../EmbraceUserSessionManager/index.ts';

export interface EmbraceSessionPartManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  visibilityDoc?: VisibilityStateDocument;
  storage?: Storage;
  limitManager: LimitManagerInternal;
  userSessionManager?: UserSessionLifecycleManager;
}

export type SessionPartStartedListener = () => void;
export type SessionPartEndedListener = () => void;
