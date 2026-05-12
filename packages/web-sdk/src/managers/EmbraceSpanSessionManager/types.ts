import type { DiagLogger } from '@opentelemetry/api';
import type { SpanSessionManager } from '../../api-sessions/index.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';

export interface EmbraceSpanSessionManagerArgs {
  diag?: DiagLogger;
  perf: PerformanceManager;
  visibilityDoc: VisibilityStateDocument;
  storage: Storage;
  limitManager: LimitManagerInternal;
}

export interface SpanSessionManagerInternal extends SpanSessionManager {
  incrSessionCountForKey: (key: string) => void;
  incrNextSessionCountForKey: (key: string) => void;
}

export type SessionStartedListener = () => void;
export type SessionEndedListener = () => void;
