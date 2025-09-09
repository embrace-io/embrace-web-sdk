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

// What gets stored in localStorage for discovery by child tabs
export type StoredTab = {
  experienceId: string;
  tabId: string;
  timestamp: number;
};

// This tab's identity (stored in session storage)
export type Tab = {
  experienceId: string;
  tabId: string;
  parentTabId?: string;
};
