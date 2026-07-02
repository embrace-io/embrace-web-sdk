import type {
  NavigationHost,
  VisibilityStateDocument,
} from '../../../common/index.ts';

export const isTabEngaged = (visibilityDoc: VisibilityStateDocument): boolean =>
  visibilityDoc.visibilityState === 'visible' && visibilityDoc.hasFocus();

export interface ActivityListenersArgs {
  target: EventTarget;
  visibilityDoc: VisibilityStateDocument;
  navigationHost: NavigationHost;
  activityEvents: ReadonlyArray<string>;
  onActivity: (event: Event) => void;
  onVisibilityChange: (event: Event) => void;
  onFocus: (event: Event) => void;
  onBlur: (event: Event) => void;
  onSoftNavigation: (event: NavigationCurrentEntryChangeEvent) => void;
}

export const addActivityListeners = ({
  target,
  visibilityDoc,
  navigationHost,
  activityEvents,
  onActivity,
  onVisibilityChange,
  onFocus,
  onBlur,
  onSoftNavigation,
}: ActivityListenersArgs): void => {
  for (const event of activityEvents) {
    target.addEventListener(event, onActivity);
  }
  // Tab visibility flips (switch tabs, minimize, OS app switch).
  visibilityDoc.addEventListener?.('visibilitychange', onVisibilityChange);
  // Window focus changes (alt-tab, click into DevTools, multi-monitor).
  target.addEventListener('focus', onFocus);
  target.addEventListener('blur', onBlur);
  navigationHost.navigation?.addEventListener(
    'currententrychange',
    onSoftNavigation,
  );
};

export const removeActivityListeners = ({
  target,
  visibilityDoc,
  navigationHost,
  activityEvents,
  onActivity,
  onVisibilityChange,
  onFocus,
  onBlur,
  onSoftNavigation,
}: ActivityListenersArgs): void => {
  for (const event of activityEvents) {
    target.removeEventListener(event, onActivity);
  }
  visibilityDoc.removeEventListener?.('visibilitychange', onVisibilityChange);
  target.removeEventListener('focus', onFocus);
  target.removeEventListener('blur', onBlur);
  navigationHost.navigation?.removeEventListener(
    'currententrychange',
    onSoftNavigation,
  );
};
