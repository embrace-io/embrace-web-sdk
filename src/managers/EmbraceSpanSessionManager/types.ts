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
  referrer?: string;
}

export interface SpanSessionManagerInternal extends SpanSessionManager {
  incrSessionCountForKey: (key: string) => void;
}

export type SessionStartedListener = () => void;
export type SessionEndedListener = () => void;

// Tab tracking types

// Tab activity stored in localStorage
export type TabActivity = {
  experienceId: string;
  tabId: string;
  lastActivityMs: number;
};

// Tab identity stored in session storage
export type Tab = {
  experienceId: string;
  tabId: string;
  sourceTabId?: string;
};

// Navigation source types (determined fresh each session)
export type NavigationSource =
  | 'same_origin' // User clicked same-origin link
  | 'external' // User clicked external link
  | 'direct' // User opened new tab, typed URL, or used bookmark (no referrer)
  | 'reload' // Page refresh
  | 'back_forward'; // Browser back/forward navigation
