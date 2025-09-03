import type { DiagLogger } from '@opentelemetry/api';

// Navigation and tab open tracking types
export type TabOpenMethod =
  | 'same_origin_link' // User clicked same-origin link - inherits experience
  | 'external_link' // User clicked external link - new experience
  | 'manual_new_tab' // User opened new tab manually (Ctrl+T) - new experience
  | 'window_opener' // Opened via window.open() - inherits experience
  | 'reload' // Page refresh - maintains experience
  | 'back_forward' // Browser back/forward navigation - maintains experience
  | 'unknown'; // Unable to determine - new experience

export type ReferrerType = 'same_origin' | 'external' | 'none';

// Tab-specific experience data stored in sessionStorage (persists through refresh)
export interface ExperienceData {
  experienceId: string;
  lastActivityAt: number;
  tabOpenMethod: TabOpenMethod;
  referrerType: ReferrerType;
  previousTabId?: string; // ID of previous tab if this session inherited from another tab
}

export interface EmbraceExperienceManagerArgs {
  diag?: DiagLogger;
  storage?: Storage;
  sessionStorage?: Storage;
}
