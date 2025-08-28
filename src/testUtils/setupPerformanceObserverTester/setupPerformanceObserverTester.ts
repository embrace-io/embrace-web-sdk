import * as sinon from 'sinon';
import type {
  PerformanceObserverCallbackOptions,
  PerformanceObserverCallbackWithOptions,
} from '../../instrumentations/network/NetworkInstrumentation/types.js';

export const setupPerformanceObserverTester = () => {
  const observerStub = sinon.createStubInstance(PerformanceObserver);
  let instrumentationCallback:
    | PerformanceObserverCallbackWithOptions
    | undefined = undefined;

  return {
    observerStub,
    builder: (callback: PerformanceObserverCallbackWithOptions) => {
      instrumentationCallback = callback;
      return observerStub;
    },
    invokeCallback: (
      entries: PerformanceEntry[],
      options?: PerformanceObserverCallbackOptions
    ) => {
      if (!instrumentationCallback) {
        return false;
      }

      const entryList = sinon.createStubInstance(PerformanceObserverEntryList, {
        getEntriesByType: entries,
      });

      instrumentationCallback(entryList, observerStub, options);
      return true;
    },
  };
};
