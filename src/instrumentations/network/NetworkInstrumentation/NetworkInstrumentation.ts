/*
  This instrumentation is taking code from here as a starting point:
    https://github.com/open-telemetry/opentelemetry-js/blob/main/experimental/packages/opentelemetry-instrumentation-fetch/src/fetch.ts
 */

import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import type {
  NetworkInstrumentationArgs,
  PerformanceObserverCallbackWithOptions,
} from './types.js';

import {
  ATTR_ERROR_TYPE,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_FULL,
} from '@opentelemetry/semantic-conventions';

import {
  ATTR_HTTP_REQUEST_BODY_SIZE,
  ATTR_HTTP_RESPONSE_BODY_SIZE,
  ATTR_ERROR_MESSAGE,
} from '@opentelemetry/semantic-conventions/incubating';

const DEFAULT_PERFORMANCE_OBSERVER_CREATOR = (
  callback: PerformanceObserverCallbackWithOptions
) => {
  if (typeof PerformanceObserver !== 'function') {
    return undefined;
  }

  return new PerformanceObserver(callback);
};

export class NetworkInstrumentation extends EmbraceInstrumentationBase {
  private readonly _performanceObserver: PerformanceObserver | undefined;

  public constructor({
    diag,
    perf,
    // TODO use ignoreURLS
    ignoreUrls: _ignoreUrls,
    performanceObserverBuilder = DEFAULT_PERFORMANCE_OBSERVER_CREATOR,
  }: NetworkInstrumentationArgs = {}) {
    super({
      instrumentationName: 'NetworkInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._performanceObserver = performanceObserverBuilder(
      (
        list: PerformanceObserverEntryList,
        _observer: PerformanceObserver,
        options?: { droppedEntriesCount: number }
      ) => {
        list.getEntriesByType('resource').forEach(entry => {
          if (entry.entryType !== 'resource') {
            return;
          }

          const resourceTimingEntry = entry as PerformanceResourceTiming;

          if (
            resourceTimingEntry.initiatorType !== 'fetch' &&
            resourceTimingEntry.initiatorType !== 'xmlhttprequest'
          ) {
            return;
          }

          const networkSpan = this.tracer.startSpan(resourceTimingEntry.name, {
            startTime: this.perf.epochMillisFromOriginOffset(
              resourceTimingEntry.fetchStart
            ),
            attributes: {
              [ATTR_URL_FULL]: resourceTimingEntry.name,
              [ATTR_HTTP_REQUEST_METHOD]: 'unknown', // TODO no way to retrieve this
              [ATTR_HTTP_RESPONSE_STATUS_CODE]:
                resourceTimingEntry.responseStatus,
              [ATTR_HTTP_REQUEST_BODY_SIZE]: 0, // TODO no way to retrieve this
              [ATTR_HTTP_RESPONSE_BODY_SIZE]:
                resourceTimingEntry.decodedBodySize,
            },
          });

          if (resourceTimingEntry.responseStatus >= 400) {
            networkSpan.setAttributes({
              [ATTR_ERROR_MESSAGE]: 'unknown', // TODO no way to retrieve this
              [ATTR_ERROR_TYPE]: 'unknown',
            });
          }

          networkSpan.end(resourceTimingEntry.responseEnd);
        });
        if (options && options.droppedEntriesCount > 0) {
          // TODO handle this? Emit a warning and include an attribute on session?
        }
      }
    );

    if (!this._performanceObserver) {
      // TODO handle this? Emit a warning and include an attribute on session?
      return;
    }

    if (this._config.enabled) {
      this.enable();
    }
  }

  public disable(): void {
    this._performanceObserver?.disconnect();
  }

  public enable(): void {
    this._performanceObserver?.observe({ type: 'resource', buffered: true });
  }
}
