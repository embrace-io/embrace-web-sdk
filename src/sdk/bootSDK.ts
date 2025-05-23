import { GLOBAL_SDK_NAME } from './constants.js';
import type { EmbraceSdk, OnReadyCallback } from './types.js';

// After the initial callbacks are executed, call every subsequent callback directly
export const onReady = (callback: OnReadyCallback) => {
  callback();
};

/**
 * This function executes the queued callbacks that were added via `onReady`
 * when it is defined using the async loading snippet.
 *
 * It also defines the global SDK object with the provided SDK instance.
 * This is to ensure the SDK is globally available even before the bundle finishes loading
 * when it is imported directly using a <script> tag.
 *
 * Calling `onReady` when bundled directly into the client code (via npm)
 * or after the bundle is loaded will result in a no-op.
 */
export const bootSDK = (sdk: EmbraceSdk) => {
  const callbackQueue = window[GLOBAL_SDK_NAME]?.q || ([] as OnReadyCallback[]);

  // When using the async loading snippet, the SDK is partially defined like so
  // e.EmbraceWebSdk=e.EmbraceWebSdk||{q:[],onReady:function(f){e.EmbraceWebSdk.q.push(f);}};
  // Now that the SDK is fully loaded, we can replace the global definition
  window[GLOBAL_SDK_NAME] = {
    ...sdk,
    q: callbackQueue,
  };

  // These callbacks are defined before the SDK loads
  for (const callback of callbackQueue) {
    try {
      callback();
    } catch (e) {
      console.error('Error executing callback from SDK queue:', e);
    }
  }

  // Clear the queue after executing the callbacks
  window[GLOBAL_SDK_NAME].q = [];
};
