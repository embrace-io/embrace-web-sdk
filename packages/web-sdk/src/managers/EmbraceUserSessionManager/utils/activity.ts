import type { VisibilityStateDocument } from '../../../common/index.ts';

export interface ActivityListenersArgs {
  target: EventTarget;
  visibilityDoc: VisibilityStateDocument;
  activityEvents: ReadonlyArray<string>;
  onActivity: (event: Event) => void;
  onVisibilityChange: (event: Event) => void;
  onFocus: (event: Event) => void;
}

export const addActivityListeners = ({
  target,
  visibilityDoc,
  activityEvents,
  onActivity,
  onVisibilityChange,
  onFocus,
}: ActivityListenersArgs): void => {
  for (const event of activityEvents) {
    target.addEventListener(event, onActivity);
  }
  // Tab visibility flips (switch tabs, minimize, OS app switch).
  visibilityDoc.addEventListener?.('visibilitychange', onVisibilityChange);
  // Window focus arriving (alt-tab back, click into the document) shows the
  // user is present. Losing it doesn't end the part: the tab is still visible.
  target.addEventListener('focus', onFocus);
};

export const removeActivityListeners = ({
  target,
  visibilityDoc,
  activityEvents,
  onActivity,
  onVisibilityChange,
  onFocus,
}: ActivityListenersArgs): void => {
  for (const event of activityEvents) {
    target.removeEventListener(event, onActivity);
  }
  visibilityDoc.removeEventListener?.('visibilitychange', onVisibilityChange);
  target.removeEventListener('focus', onFocus);
};
