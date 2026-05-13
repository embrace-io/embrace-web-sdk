import type { VisibilityStateDocument } from '../../../common/index.ts';

export const isTabEngaged = (visibilityDoc: VisibilityStateDocument): boolean =>
  visibilityDoc.visibilityState === 'visible' && visibilityDoc.hasFocus();

export interface ActivityListenersArgs {
  target: EventTarget;
  visibilityDoc: VisibilityStateDocument;
  activityEvents: ReadonlyArray<string>;
  onActivity: (event: Event) => void;
  onVisibilityChange: (event: Event) => void;
  onFocus: (event: Event) => void;
  onBlur: (event: Event) => void;
  onPageShow: (event: PageTransitionEvent) => void;
  onPageHide: (event: PageTransitionEvent) => void;
}

export const addActivityListeners = ({
  target,
  visibilityDoc,
  activityEvents,
  onActivity,
  onVisibilityChange,
  onFocus,
  onBlur,
  onPageShow,
  onPageHide,
}: ActivityListenersArgs): void => {
  for (const event of activityEvents) {
    target.addEventListener(event, onActivity);
  }
  // Tab visibility flips (switch tabs, minimize, OS app switch).
  visibilityDoc.addEventListener?.('visibilitychange', onVisibilityChange);
  // Window focus changes (alt-tab, click into DevTools, multi-monitor).
  target.addEventListener('focus', onFocus);
  target.addEventListener('blur', onBlur);
  // Initial page load AND BFCache restore. Distinguished by event.persisted.
  target.addEventListener('pageshow', onPageShow as EventListener);
  // Navigation away AND BFCache freeze. Distinguished by event.persisted.
  target.addEventListener('pagehide', onPageHide as EventListener);
};

export const removeActivityListeners = ({
  target,
  visibilityDoc,
  activityEvents,
  onActivity,
  onVisibilityChange,
  onFocus,
  onBlur,
  onPageShow,
  onPageHide,
}: ActivityListenersArgs): void => {
  for (const event of activityEvents) {
    target.removeEventListener(event, onActivity);
  }
  visibilityDoc.removeEventListener?.('visibilitychange', onVisibilityChange);
  target.removeEventListener('focus', onFocus);
  target.removeEventListener('blur', onBlur);
  target.removeEventListener('pageshow', onPageShow as EventListener);
  target.removeEventListener('pagehide', onPageHide as EventListener);
};
