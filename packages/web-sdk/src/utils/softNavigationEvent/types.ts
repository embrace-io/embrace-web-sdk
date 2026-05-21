export const SOFT_NAVIGATION_EVENT = 'emb:soft-navigation';

/**
 * Identifies which detection strategy produced a soft-navigation event. Useful
 * for consumers that want to weight confidence: `soft-navigation-entry` comes
 * from the browser's first-party Soft Navigations API and reflects actual
 * paint timing; `navigation-api` and `history` are SDK-side reconstructions
 * with a double-rAF estimate of paint.
 */
export type SoftNavigationSource =
  | 'soft-navigation-entry'
  | 'navigation-api'
  | 'history';

export interface SoftNavigationDetail {
  /** Detection strategy that produced this event. */
  source: SoftNavigationSource;
  /** URL after the navigation. */
  url: string;
  /** URL before the navigation. */
  previousUrl: string;
  /**
   * Start of the navigation as a `DOMHighResTimeStamp` (relative to
   * `performance.timeOrigin`). On the SDK-side paths this is the timestamp of
   * the originating user interaction; on the native path it is
   * `PerformanceEntry.startTime`.
   */
  startTime: number;
  /**
   * Approximate paint completion as a `DOMHighResTimeStamp`. On the native
   * path this reflects the entry's `paintTime`/`presentationTime` (or
   * `startTime` if neither is reported). On the SDK-side paths it is the
   * timestamp delivered by a double-`requestAnimationFrame`, which estimates
   * the next composited frame.
   */
  paintTime: number;
  /**
   * Unique navigation identifier. Mirrors the native entry's `navigationId`
   * when available; otherwise a generated UUID. Stable for the lifetime of
   * the event.
   */
  navigationId: string;
}

export interface SoftNavigationOptions {
  /**
   * Maximum gap, in ms, between a `pointerdown`/`keydown` and a URL change
   * that still counts as user-initiated on the SDK-side fallback paths. The
   * native Soft Navigations API performs its own interaction correlation and
   * ignores this option.
   */
  interactionTimeoutMs?: number;
}

declare global {
  interface WindowEventMap {
    [SOFT_NAVIGATION_EVENT]: CustomEvent<SoftNavigationDetail>;
  }
}
