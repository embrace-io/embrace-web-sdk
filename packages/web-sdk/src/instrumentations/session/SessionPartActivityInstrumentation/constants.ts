/** 30 minutes in ms. After this window of no user input during an active
 * foreground part, the SDK ends the part with reason `inactivity`. */
export const PART_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

/** 30 seconds in ms. Upper bound on how often the activity handler runs; prevents
 * mousemove from calling setTimeout for every sub-second event. */
export const ACTIVITY_THROTTLE_MS = 30 * 1000;

/** Input events that count as user interaction with a foreground tab. */
export const ACTIVITY_EVENTS: ReadonlyArray<string> = [
  'keydown',
  'mousedown',
  'mousemove',
  'scroll',
];
