import type { DiagLogger } from '@opentelemetry/api';
import type { PerformanceManager } from '../../utils/index.js';
import type { VisibilityStateDocument } from '../../common/index.js';
import type { SpanSessionManager } from '../../api-sessions/index.js';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.js';
import type { EmbraceExperienceManager } from '../EmbraceExperienceManager/index.js';

export interface EmbraceSpanSessionManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  visibilityDoc?: VisibilityStateDocument;
  storage?: Storage;
  limitManager: LimitManagerInternal;
  experienceManager?: EmbraceExperienceManager;
}

export interface SpanSessionManagerInternal extends SpanSessionManager {
  incrSessionCountForKey: (key: string) => void;
}

export type SessionStartedListener = () => void;
export type SessionEndedListener = () => void;
