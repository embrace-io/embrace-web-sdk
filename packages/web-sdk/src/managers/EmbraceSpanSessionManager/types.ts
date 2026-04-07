import type { DiagLogger } from '@opentelemetry/api';
import type { SpanSessionManager } from '../../api-sessions/index.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';

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
  incrNextSessionCountForKey: (key: string) => void;
}

export type SessionStartedListener = () => void;
export type SessionEndedListener = () => void;

// Tab tracking types

// Tab identity stored in session storage
export type Tab = {
  tabId: string;
};

// Navigation source types (determined fresh each session)
export type NavigationSource =
  | 'same_origin' // User clicked same-origin link
  | 'external' // User clicked external link
  | 'direct' // User opened new tab, typed URL, or used bookmark (no referrer)
  | 'reload' // Page refresh
  | 'back_forward'; // Browser back/forward navigation
