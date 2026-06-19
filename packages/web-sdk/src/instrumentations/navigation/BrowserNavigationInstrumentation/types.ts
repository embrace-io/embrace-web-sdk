import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type Confidence =
  | 'very-high'
  | 'high'
  | 'medium-high'
  | 'medium'
  | 'low';

export const INTERACTION_EVENTS = ['click', 'keydown', 'submit'] as const;
export type InteractionType = (typeof INTERACTION_EVENTS)[number];

export interface NavigationValidation {
  confidence: Confidence;
  domScore: number;
  titleChanged: boolean;
  interactionType: InteractionType | null;
  interactionLatencyMs: number | null;
  networkRequests: number;
  scrollReset: boolean;
}

export type BrowserNavigationInstrumentationConfig = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
> & {
  routeMatcher?: (url: string) => string;
  emitHardNavigations?: boolean;
  enabled?: boolean;

  enableHeuristicValidation?: boolean;
  interactionWindow?: number;
  domSettleDelay?: number;
  maxSettleDelay?: number;
  domScoreThreshold?: number;
  allowWithoutInteraction?: boolean;
  minimumConfidence?: Confidence;
};

export type NavigationType =
  | 'hard_navigation'
  | 'soft_navigation'
  | 'spa_navigation'
  | 'back_forward'
  | 'reload'
  | 'hash_change'
  | 'prerender_activation';

export type DetectionSource =
  | 'soft_nav_api'
  | 'navigation_api'
  | 'history_patch'
  | 'popstate'
  | 'hashchange'
  | 'perf_timing';

export interface NavigationEvent {
  type: NavigationType;
  url: string;
  previousUrl: string;
  timestamp: number;
  source: DetectionSource;
}

export type NavigationCallback = (event: NavigationEvent) => void;

export type Cleanup = () => void;

// https://developer.chrome.com/docs/web-platform/soft-navigations
export interface SoftNavigationEntry extends PerformanceEntry {
  previousEntryUrl?: string;
  navigationId?: string;
}

// https://developer.mozilla.org/en-US/docs/Web/API/NavigationDestination
export interface NavigationDestination {
  sameDocument: boolean;
  url: string;
}

// Minimal subset of NavigateEvent used by this instrumentation
// https://developer.mozilla.org/en-US/docs/Web/API/NavigateEvent
export interface NavigateEvent extends Event {
  destination: NavigationDestination;
  navigationType: 'push' | 'replace' | 'traverse' | 'reload';
}

export interface PerformanceWithSoftNavs extends Performance {
  softNavs?: boolean;
}

// Minimal subset of the Navigation API used by this instrumentation
// https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API
export interface NavigationAPI {
  addEventListener(type: 'navigatesuccess', listener: () => void): void;
  addEventListener(type: 'navigateerror', listener: () => void): void;
  addEventListener(
    type: 'navigate',
    listener: (event: NavigateEvent) => void,
  ): void;
  removeEventListener(type: 'navigatesuccess', listener: () => void): void;
  removeEventListener(type: 'navigateerror', listener: () => void): void;
  removeEventListener(
    type: 'navigate',
    listener: (event: NavigateEvent) => void,
  ): void;
}
