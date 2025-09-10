import type { DiagLogger } from '@opentelemetry/api';
import type { PerformanceManager } from '../../utils/index.js';
import type { VisibilityStateDocument } from '../../common/index.js';
import type { SpanSessionManager } from '../../api-sessions/index.js';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.js';

export interface EmbraceSpanSessionManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  visibilityDoc?: VisibilityStateDocument;
  storage?: Storage;
  sessionStorage?: Storage;
  limitManager: LimitManagerInternal;
}

export interface SpanSessionManagerInternal extends SpanSessionManager {
  incrSessionCountForKey: (key: string) => void;
}

export type SessionStartedListener = () => void;
export type SessionEndedListener = () => void;

// Cross-tab tracking types

// Last tab activity stored in localStorage
export type LastTabActivity = {
  experienceId: string;
  tabId: string;
  lastActivityMs: number;
};

// Tab identity stored in session storage
export type Tab = {
  experienceId: string;
  tabId: string;
  parentTabId?: string;
};
