/*
 * Adapted from OpenTelemetry document-load instrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-document-load
 *
 * Additional PerformanceResourceTiming attributes collected:
 * - entry_type, initiator_type
 * - decoded_body_size, http.response.body.size, http.response.size
 * - delivery_type (Chromium only)
 * - render_blocking_status (Chromium only)
 * - http.response.status_code (no Safari support)
 *
 * Custom diagnostic attributes added to identify resource loading issues:
 * - http.response.cors_opaque - CORS-restricted resource (opaque response)
 * - http.response.cache_revalidated - 304 Not Modified response
 * - http.request.incomplete - Request started but didn't complete (network error, aborted)
 * - http.request.prevented - Request never started (blocked by CSP, browser, extension)
 */

import type { Span } from '@opentelemetry/api';
import { context, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { TRACE_PARENT_HEADER } from '@opentelemetry/core';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import type { PerformanceEntries } from '@opentelemetry/sdk-trace-web';
import {
  addSpanNetworkEvent,
  addSpanNetworkEvents,
  hasKey,
  PerformanceTimingNames,
} from '@opentelemetry/sdk-trace-web';
import { ATTR_HTTP_RESPONSE_STATUS_CODE } from '@opentelemetry/semantic-conventions';
import {
  ATTR_HTTP_RESPONSE_BODY_SIZE,
  ATTR_HTTP_RESPONSE_SIZE,
  ATTR_URL_FULL,
  ATTR_USER_AGENT_ORIGINAL,
} from '@opentelemetry/semantic-conventions/incubating';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.ts';
import { createPerformanceObserver } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import { AttributeNames } from './enums/AttributeNames.ts';
import type {
  DocumentLoadCustomAttributeFunction,
  DocumentLoadInstrumentationConfig,
  ResourceFetchCustomAttributeFunction,
} from './types.ts';
import {
  addSpanPerformancePaintEvents,
  getPerformanceNavigationEntries,
} from './utils.ts';

/**
 * Adds new browser features not yet in TypeScript's DOM lib (as of Oct 2025):
 * - deliveryType: Chromium only (experimental) https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/deliveryType
 * - renderBlockingStatus: Chromium only https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/renderBlockingStatus
 */
type EmbracePerformanceResourceTiming = PerformanceResourceTiming & {
  deliveryType?: 'cache' | '';
  renderBlockingStatus?: 'blocking' | 'non-blocking';
};

// PerformanceResourceTiming attribute names
const ATTR_HTTP_RESPONSE_DELIVERY_TYPE = 'http.response.delivery_type';
const ATTR_HTTP_RESPONSE_DECODED_BODY_SIZE = 'http.response.decoded_body_size';
const ATTR_HTTP_REQUEST_INITIATOR_TYPE = 'http.request.initiator_type';
const ATTR_HTTP_REQUEST_RENDER_BLOCKING_STATUS =
  'http.request.render_blocking_status';

// Diagnostic attribute names
const ATTR_HTTP_RESPONSE_CORS_OPAQUE = 'http.response.cors_opaque'; // CORS-restricted resource (opaque response)
const ATTR_HTTP_RESPONSE_CACHE_REVALIDATED = 'http.response.cache_revalidated'; // 304 Not Modified response
const ATTR_HTTP_REQUEST_INCOMPLETE = 'http.request.incomplete'; // Request started but didn't complete
const ATTR_HTTP_REQUEST_PREVENTED = 'http.request.prevented'; // Request never started (blocked)

export class DocumentLoadInstrumentation extends EmbraceInstrumentationBase<DocumentLoadInstrumentationConfig> {
  private _navigationObserver: PerformanceObserver | null = null;
  private _performanceCollected = false;

  // 'enabled' is refused here: construction only wires the instrumentation up,
  // and registerInstrumentations starts it regardless of any flag passed in.
  public constructor({
    diag,
    perf,
    applyCustomAttributesOnSpan,
    ignorePerformancePaintEvents = false,
    ignoreNetworkEvents = false,
  }: Omit<DocumentLoadInstrumentationConfig, 'enabled'> = {}) {
    super({
      instrumentationName: 'DocumentLoadInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {
        applyCustomAttributesOnSpan,
        ignorePerformancePaintEvents,
        ignoreNetworkEvents,
      },
    });
  }

  /**
   * Adds spans for all resources
   * @param rootSpan
   */
  private _addResourcesSpans(rootSpan: Span): void {
    const resources: EmbracePerformanceResourceTiming[] =
      performance.getEntriesByType('resource');
    resources.forEach((resource) => {
      this._initResourceSpan(resource, rootSpan);
    });
  }

  /**
   * The one navigation entry per document is mutated in place as the load
   * progresses, so collecting early would end the documentLoad span at time
   * origin. Returning early leaves the observer subscribed for a later
   * notification.
   */
  private _collectIfLoadEventFinished(): void {
    if (this._performanceCollected || !this._isLoadEventFinished()) {
      return;
    }

    // Latched before collecting so a throw part way through cannot emit a
    // second set of spans on a later trigger.
    this._performanceCollected = true;

    try {
      this._collectPerformance();
    } catch (e) {
      this._diag.error('failed to collect the document load', e);
    } finally {
      this._disconnectObserver();
    }
  }

  /* loadEventEnd is written only after every load handler returns. WebKit
   * reports no entry at all for about:blank, popups and srcdoc iframes. */
  private _isLoadEventFinished(): boolean {
    const [navigationTiming] = performance.getEntriesByType('navigation');
    return (navigationTiming?.loadEventEnd ?? 0) > 0;
  }

  private _disconnectObserver(): void {
    this._navigationObserver?.disconnect();
    this._navigationObserver = null;
  }

  /**
   * Collects information about performance and creates appropriate spans
   */
  private _collectPerformance(): void {
    const metaElement = Array.from(document.getElementsByTagName('meta')).find(
      (e) => e.getAttribute('name') === TRACE_PARENT_HEADER,
    );
    const entries = getPerformanceNavigationEntries();
    const traceparent = metaElement?.content || '';
    context.with(propagation.extract(ROOT_CONTEXT, { traceparent }), () => {
      const rootSpan = this._startSpan(
        AttributeNames.DOCUMENT_LOAD,
        PerformanceTimingNames.FETCH_START,
        entries,
      );
      if (!rootSpan) {
        this._diag.warn(
          'navigation entry has no fetchStart, document load will not be collected',
        );
        return;
      }
      context.with(trace.setSpan(context.active(), rootSpan), () => {
        const fetchSpan = this._startSpan(
          AttributeNames.DOCUMENT_FETCH,
          PerformanceTimingNames.FETCH_START,
          entries,
        );
        if (fetchSpan) {
          fetchSpan.setAttribute(ATTR_URL_FULL, location.href);
          context.with(trace.setSpan(context.active(), fetchSpan), () => {
            addSpanNetworkEvents(
              fetchSpan,
              entries,
              this.getConfig().ignoreNetworkEvents,
            );
            this._addCustomAttributesOnSpan(
              fetchSpan,
              this.getConfig().applyCustomAttributesOnSpan?.documentFetch,
            );
            this._endSpan(
              fetchSpan,
              PerformanceTimingNames.RESPONSE_END,
              entries,
            );
          });
        }
      });

      rootSpan.setAttribute(KEY_EMB_TYPE, EMB_TYPES.DocumentLoad);
      rootSpan.setAttribute(ATTR_URL_FULL, location.href);
      rootSpan.setAttribute(ATTR_USER_AGENT_ORIGINAL, navigator.userAgent);

      this._addResourcesSpans(rootSpan);

      if (!this.getConfig().ignoreNetworkEvents) {
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.FETCH_START,
          entries,
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.UNLOAD_EVENT_START,
          entries,
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.UNLOAD_EVENT_END,
          entries,
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.DOM_INTERACTIVE,
          entries,
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.DOM_CONTENT_LOADED_EVENT_START,
          entries,
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.DOM_CONTENT_LOADED_EVENT_END,
          entries,
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.DOM_COMPLETE,
          entries,
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.LOAD_EVENT_START,
          entries,
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.LOAD_EVENT_END,
          entries,
        );
      }

      if (!this.getConfig().ignorePerformancePaintEvents) {
        addSpanPerformancePaintEvents(rootSpan, this.perf);
      }

      this._addCustomAttributesOnSpan(
        rootSpan,
        this.getConfig().applyCustomAttributesOnSpan?.documentLoad,
      );
      this._endSpan(rootSpan, PerformanceTimingNames.LOAD_EVENT_END, entries);
    });
  }

  /**
   * Helper function for ending a span
   * @param span
   * @param performanceName name of performance entry for end time
   * @param entries
   */
  private _endSpan(
    span: Span | undefined,
    performanceName: string,
    entries: PerformanceEntries,
  ) {
    // Span can be undefined when entries are missing the required performance timing - no span will be created
    if (span) {
      if (
        hasKey(entries, performanceName) &&
        typeof entries[performanceName] === 'number'
      ) {
        span.end(this.perf.epochMillisFromOrigin(entries[performanceName]));
      } else {
        span.end();
      }
    }
  }

  /**
   * Creates and ends a span with network information about a resource added as timed events
   * @param resource
   * @param parentSpan
   */
  private _initResourceSpan(
    resource: EmbracePerformanceResourceTiming,
    parentSpan: Span,
  ) {
    const span = this._startSpan(
      AttributeNames.RESOURCE_FETCH,
      PerformanceTimingNames.FETCH_START,
      resource,
      parentSpan,
    );
    if (!span) {
      return;
    }

    span.setAttribute(KEY_EMB_TYPE, EMB_TYPES.ResourceFetch);
    span.setAttribute(ATTR_URL_FULL, resource.name);
    addSpanNetworkEvents(span, resource, this.getConfig().ignoreNetworkEvents);

    if (resource.deliveryType) {
      span.setAttribute(
        ATTR_HTTP_RESPONSE_DELIVERY_TYPE,
        resource.deliveryType,
      );
    }

    if (resource.initiatorType) {
      span.setAttribute(
        ATTR_HTTP_REQUEST_INITIATOR_TYPE,
        resource.initiatorType,
      );
    }

    if (resource.renderBlockingStatus) {
      span.setAttribute(
        ATTR_HTTP_REQUEST_RENDER_BLOCKING_STATUS,
        resource.renderBlockingStatus,
      );
    }

    if (resource.responseStatus) {
      span.setAttribute(
        ATTR_HTTP_RESPONSE_STATUS_CODE,
        resource.responseStatus,
      );
    }

    span.setAttribute(ATTR_HTTP_RESPONSE_BODY_SIZE, resource.encodedBodySize);
    span.setAttribute(ATTR_HTTP_RESPONSE_SIZE, resource.transferSize);
    span.setAttribute(
      ATTR_HTTP_RESPONSE_DECODED_BODY_SIZE,
      resource.decodedBodySize,
    );

    this._addResourceDiagnosticAttributes(span, resource);

    this._addCustomAttributesOnResourceSpan(
      span,
      resource,
      this.getConfig().applyCustomAttributesOnSpan?.resourceFetch,
    );
    this._endSpan(span, PerformanceTimingNames.RESPONSE_END, resource);
  }

  /**
   * Helper function for starting a span
   * @param spanName name of span
   * @param performanceName name of performance entry for time start
   * @param entries
   * @param parentSpan
   */
  private _startSpan(
    spanName: string,
    performanceName: string,
    entries: PerformanceEntries,
    parentSpan?: Span,
  ): Span | undefined {
    if (
      hasKey(entries, performanceName) &&
      typeof entries[performanceName] === 'number'
    ) {
      const span = this.tracer.startSpan(
        spanName,
        {
          startTime: this.perf.epochMillisFromOrigin(entries[performanceName]),
        },
        parentSpan ? trace.setSpan(context.active(), parentSpan) : undefined,
      );
      return span;
    }
    return undefined;
  }

  /**
   * Adds custom attributes to span if configured
   * Used for both documentFetch and documentLoad spans
   */
  private _addCustomAttributesOnSpan(
    span: Span,
    applyCustomAttributesOnSpan:
      | DocumentLoadCustomAttributeFunction
      | undefined,
  ) {
    if (applyCustomAttributesOnSpan) {
      safeExecuteInTheMiddle(
        () => {
          applyCustomAttributesOnSpan(span);
        },
        (error) => {
          if (!error) {
            return;
          }

          this._diag.error('addCustomAttributesOnSpan', error);
        },
        true,
      );
    }
  }

  /**
   * Adds custom attributes to resource span if configured
   */
  private _addCustomAttributesOnResourceSpan(
    span: Span,
    resource: EmbracePerformanceResourceTiming,
    applyCustomAttributesOnSpan:
      | ResourceFetchCustomAttributeFunction
      | undefined,
  ) {
    if (applyCustomAttributesOnSpan) {
      safeExecuteInTheMiddle(
        () => {
          applyCustomAttributesOnSpan(span, resource);
        },
        (error) => {
          if (!error) {
            return;
          }

          this._diag.error('addCustomAttributesOnResourceSpan', error);
        },
        true,
      );
    }
  }

  private _hasNoSizeData(resource: EmbracePerformanceResourceTiming): boolean {
    return (
      resource.transferSize === 0 &&
      resource.decodedBodySize === 0 &&
      resource.encodedBodySize === 0
    );
  }

  private _hasTimingData(resource: EmbracePerformanceResourceTiming): boolean {
    return resource.fetchStart > 0 && resource.responseEnd > 0;
  }

  private _isCorsRestricted(
    resource: EmbracePerformanceResourceTiming,
  ): boolean {
    return this._hasNoSizeData(resource) && this._hasTimingData(resource);
  }

  private _isFetchIncomplete(
    resource: EmbracePerformanceResourceTiming,
  ): boolean {
    return (
      this._hasNoSizeData(resource) &&
      resource.fetchStart > 0 &&
      resource.responseEnd === 0
    );
  }

  private _isFetchPrevented(
    resource: EmbracePerformanceResourceTiming,
  ): boolean {
    return this._hasNoSizeData(resource) && resource.fetchStart === 0;
  }

  /**
   * Detect cache validation (304 Not Modified responses)
   *
   * 304 responses show transferSize of ~300 bytes (headers only, no body).
   * Use deliveryType to distinguish from cache hits: 'cache' = no network, otherwise = 304.
   *
   * Spec: https://w3c.github.io/resource-timing/#dom-performanceresourcetiming-transfersize
   */
  private _isCacheValidated(
    resource: EmbracePerformanceResourceTiming,
  ): boolean {
    // deliveryType is Chromium only, so an engine without it never reads 'cache'.
    return resource.transferSize === 300 && resource.deliveryType !== 'cache';
  }

  /**
   * Add diagnostic attributes to identify resource loading issues
   *
   * Diagnostic attributes help identify why resources may have incomplete timing data:
   * - CORS restrictions (opaque responses without Timing-Allow-Origin header)
   * - Cache revalidation (304 Not Modified responses)
   * - Request incomplete (started but didn't complete - network error, aborted)
   * - Request prevented (never started - blocked by CSP, browser, extension)
   *
   * The size and timing fields read below are always numbers: a cross-origin
   * resource with no Timing-Allow-Origin reports them as 0 rather than omitting
   * them, and a resource only reaches here once it has produced a span, which
   * required a numeric fetchStart.
   */
  private _addResourceDiagnosticAttributes(
    span: Span,
    resource: EmbracePerformanceResourceTiming,
  ): void {
    if (this._isCorsRestricted(resource)) {
      span.setAttribute(ATTR_HTTP_RESPONSE_CORS_OPAQUE, true);
    } else if (this._isFetchIncomplete(resource)) {
      span.setAttribute(ATTR_HTTP_REQUEST_INCOMPLETE, true);
    } else if (this._isFetchPrevented(resource)) {
      span.setAttribute(ATTR_HTTP_REQUEST_PREVENTED, true);
    }

    if (this._isCacheValidated(resource)) {
      span.setAttribute(ATTR_HTTP_RESPONSE_CACHE_REVALIDATED, true);
    }
  }

  public override onEnable(): void {
    // An unbuffered subscription registered after the load event is never
    // notified, so the finished entry is read off the timeline instead. Spans
    // are recorded here: enabling happens once the providers are attached.
    this._collectIfLoadEventFinished();
    if (this._performanceCollected) {
      return;
    }

    // buffered must stay false: mid-load, WebKit answers a buffered
    // subscription with the unfinished entry and counts it as the observer's
    // one notification, so the finalized entry never arrives. Measured on
    // Safari 26.6 and Playwright WebKit, 2026-08-13; the performance-timeline
    // spec does not say whether a replay preempts a later notification, so
    // treat neither engine's choice as guaranteed.
    this._navigationObserver = createPerformanceObserver(
      'navigation',
      () => {
        this._collectIfLoadEventFinished();
      },
      { buffered: false, diag: this._diag },
    );

    if (!this._navigationObserver) {
      this._diag.warn(
        'navigation entries are not observable, document load will not be collected',
      );
    }
  }

  public override onDisable(): void {
    this._disconnectObserver();
  }
}
