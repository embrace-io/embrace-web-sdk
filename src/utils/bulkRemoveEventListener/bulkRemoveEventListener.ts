import type { BulkRemoveEventListenerArgs } from './types.js';

/**
 * Remove multiple event listeners from a target element.
 * example:
 *
 * ```
 * bulkRemoveEventListener({
 *  target: window,
 *  events: ['visibilitychange', 'resize'],
 *  callback: someRefToACallbackFunction,
 *  });
 *```
 * */
export const bulkRemoveEventListener = ({
  target,
  events,
  callback
}: BulkRemoveEventListenerArgs) => {
  events.forEach(event => {
    target.removeEventListener(event, callback);
  });
};
