export const SOFT_NAVIGATION_EVENT = 'emb:soft-navigation';

export interface SoftNavigationDetail {
  url: string;
  previousUrl: string;
  startTime: number;
  paintTime: number;
  navigationId: string;
}

export interface SoftNavigationOptions {
  interactionTimeoutMs?: number;
}

declare global {
  interface WindowEventMap {
    'emb:soft-navigation': CustomEvent<SoftNavigationDetail>;
  }
}
