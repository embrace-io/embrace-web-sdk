import type { VisibilityStateDocument } from '../../../common/index.ts';

export const isTabEngaged = (visibilityDoc: VisibilityStateDocument): boolean =>
  visibilityDoc.visibilityState === 'visible' && visibilityDoc.hasFocus();

export interface ActivityListenersArgs {
  target: EventTarget;
  visibilityDoc: VisibilityStateDocument;
  activityEvents: ReadonlyArray<string>;
  onActivity: (event: Event) => void;
  onEngagementChange: (event: Event) => void;
}

export const addActivityListeners = ({
  target,
  visibilityDoc,
  activityEvents,
  onActivity,
  onEngagementChange,
}: ActivityListenersArgs): void => {
  for (const event of activityEvents) {
    target.addEventListener(event, onActivity);
  }
  visibilityDoc.addEventListener?.('visibilitychange', onEngagementChange);
  target.addEventListener('focus', onEngagementChange);
  target.addEventListener('blur', onEngagementChange);
  target.addEventListener('pageshow', onEngagementChange);
  target.addEventListener('pagehide', onEngagementChange);
};

export const removeActivityListeners = ({
  target,
  visibilityDoc,
  activityEvents,
  onActivity,
  onEngagementChange,
}: ActivityListenersArgs): void => {
  for (const event of activityEvents) {
    target.removeEventListener(event, onActivity);
  }
  visibilityDoc.removeEventListener?.('visibilitychange', onEngagementChange);
  target.removeEventListener('focus', onEngagementChange);
  target.removeEventListener('blur', onEngagementChange);
  target.removeEventListener('pageshow', onEngagementChange);
  target.removeEventListener('pagehide', onEngagementChange);
};
