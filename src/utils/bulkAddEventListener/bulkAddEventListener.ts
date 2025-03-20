import type { BulkAddEventListenerArgs } from './types.js';

/**
 * Add multiple event listeners to a target element.
 * example:
 *
 * ```
 * bulkAddEventListener({
 *  target: window,
 *  events: ['visibilitychange', 'resize'],
 *  callback: () => console.log('Event fired'),
 *  });
 *```
 * */
export const bulkAddEventListener = ({
  target,
  events,
  callback
}: BulkAddEventListenerArgs) => {
  events.forEach(event => {
    target.addEventListener(event, callback);
  });
};
