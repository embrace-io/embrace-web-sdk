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
 *
 * Navigation-only attributes added to the document fetch span (no PerformanceResourceTiming equivalent):
 * - browser.navigation_timing.type - how the browser arrived at the page (navigate, reload, back_forward)
 * - browser.navigation_timing.not_restored_reasons - why the page couldn't be restored from the back/forward cache (Limited availability)
 */

import type { Span } from '@opentelemetry/api';
import { context, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { TRACE_PARENT_HEADER } from '@opentelemetry/core';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { ATTR_HTTP_RESPONSE_STATUS_CODE } from '@opentelemetry/semantic-conventions';
import {
  ATTR_HTTP_RESPONSE_BODY_SIZE,
  ATTR_HTTP_RESPONSE_CONTENT_LENGTH,
  ATTR_HTTP_RESPONSE_CONTENT_LENGTH_UNCOMPRESSED,
  ATTR_HTTP_RESPONSE_SIZE,
  ATTR_URL_FULL,
  ATTR_USER_AGENT_ORIGINAL,
} from '@opentelemetry/semantic-conventions/incubating';
import {
  EMB_TYPES,
  KEY_BROWSER_NAVIGATION_TIMING_NOT_RESTORED_REASONS,
  KEY_EMB_TYPE,
} from '../../../constants/index.ts';
import type { EmbracePerformanceNavigationTiming } from '../../../utils/index.ts';
import {
  createPerformanceObserver,
  getBfcacheNotRestoredReasons,
  getNonBaselineNavigationTiming,
} from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import { AttributeNames } from './enums/AttributeNames.ts';
import type {
  DocumentLoadCustomAttributeFunction,
  DocumentLoadInstrumentationArgs,
  ResourceFetchCustomAttributeFunction,
} from './types.ts';
import type { EmbracePerformanceResourceTiming } from './utils.ts';
import {
  addSpanNetworkEvent,
  addSpanNetworkEvents,
  addSpanPerformancePaintEvents,
} from './utils.ts';

const ROOT_SPAN_TIMING_MARKS = [
  'fetchStart',
  'unloadEventStart',
  'unloadEventEnd',
  'domInteractive',
  'domContentLoadedEventStart',
  'domContentLoadedEventEnd',
  'domComplete',
  'loadEventStart',
  'loadEventEnd',
] as const;

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

// Navigation-only attribute names - no PerformanceResourceTiming equivalent, so these never apply to resource fetch spans
const ATTR_BROWSER_NAVIGATION_TIMING_TYPE = 'browser.navigation_timing.type';

export class DocumentLoadInstrumentation extends EmbraceInstrumentationBase {
  private _navigationObserver: PerformanceObserver | null = null;
  private _performanceCollected: boolean = false;
  private readonly _applyCustomAttributesOnSpan: DocumentLoadInstrumentationArgs['applyCustomAttributesOnSpan'];
  private readonly _ignorePerformancePaintEvents: boolean;
  private readonly _ignoreNetworkEvents: boolean;

  public constructor({
    diag,
    perf,
    applyCustomAttributesOnSpan,
    ignorePerformancePaintEvents = false,
    ignoreNetworkEvents = false,
  }: DocumentLoadInstrumentationArgs = {}) {
    super({
      instrumentationName: 'DocumentLoadInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });
    this._applyCustomAttributesOnSpan = applyCustomAttributesOnSpan;
    this._ignorePerformancePaintEvents = ignorePerformancePaintEvents;
    this._ignoreNetworkEvents = ignoreNetworkEvents;
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
    if (this._performanceCollected) {
      return;
    }
    // loadEventEnd is written only after every load handler returns. WebKit
    // reports no entry at all for about:blank, popups and srcdoc iframes.
    const navigationTiming = getNonBaselineNavigationTiming();
    if (!(navigationTiming && navigationTiming.loadEventEnd > 0)) {
      return;
    }

    // Latched before collecting so a throw part way through cannot emit a
    // second set of spans on a later trigger.
    this._performanceCollected = true;

    try {
      this._collectPerformance(navigationTiming);
    } catch (e) {
      this._diag.error('failed to collect the document load', e);
    } finally {
      this._disconnectObserver();
    }
  }

  private _disconnectObserver(): void {
    this._navigationObserver?.disconnect();
    this._navigationObserver = null;
  }

  /**
   * Collects information about performance and creates appropriate spans
   */
  private _collectPerformance(
    navigationTiming: EmbracePerformanceNavigationTiming,
  ): void {
    const metaElement = Array.from(document.getElementsByTagName('meta')).find(
      (e) => e.getAttribute('name') === TRACE_PARENT_HEADER,
    );
    const traceparent = metaElement?.content || '';
    context.with(propagation.extract(ROOT_CONTEXT, { traceparent }), () => {
      const rootSpan = this._startSpan(
        AttributeNames.DOCUMENT_LOAD,
        navigationTiming.fetchStart,
      );
      context.with(trace.setSpan(context.active(), rootSpan), () => {
        const fetchSpan = this._startSpan(
          AttributeNames.DOCUMENT_FETCH,
          navigationTiming.fetchStart,
        );
        fetchSpan.setAttribute(ATTR_URL_FULL, location.href);
        context.with(trace.setSpan(context.active(), fetchSpan), () => {
          if (!this._ignoreNetworkEvents) {
            addSpanNetworkEvents(fetchSpan, navigationTiming);
          }
          this._addResourceAttributesToSpan(fetchSpan, navigationTiming);
          this._addNavigationTimingAttributesToSpan(
            fetchSpan,
            navigationTiming,
          );
          this._addCustomAttributesOnSpan(
            fetchSpan,
            this._applyCustomAttributesOnSpan?.documentFetch,
          );
          fetchSpan.end(
            this.perf.epochMillisFromOrigin(navigationTiming.responseEnd),
          );
        });
      });

      rootSpan.setAttribute(KEY_EMB_TYPE, EMB_TYPES.DocumentLoad);
      rootSpan.setAttribute(ATTR_URL_FULL, location.href);
      rootSpan.setAttribute(ATTR_USER_AGENT_ORIGINAL, navigator.userAgent);

      this._addResourcesSpans(rootSpan);

      if (!this._ignoreNetworkEvents) {
        for (const name of ROOT_SPAN_TIMING_MARKS) {
          addSpanNetworkEvent(rootSpan, name, navigationTiming[name]);
        }
      }

      if (!this._ignorePerformancePaintEvents) {
        addSpanPerformancePaintEvents(rootSpan, this.perf);
      }

      this._addCustomAttributesOnSpan(
        rootSpan,
        this._applyCustomAttributesOnSpan?.documentLoad,
      );
      rootSpan.end(
        this.perf.epochMillisFromOrigin(navigationTiming.loadEventEnd),
      );
    });
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
      resource.fetchStart,
      parentSpan,
    );

    span.setAttribute(ATTR_URL_FULL, resource.name);
    if (!this._ignoreNetworkEvents) {
      addSpanNetworkEvents(span, resource);
    }

    this._addResourceAttributesToSpan(span, resource);
    this._addResourceDiagnosticAttributes(span, resource);
    this._addCustomAttributesOnResourceSpan(
      span,
      resource,
      this._applyCustomAttributesOnSpan?.resourceFetch,
    );
    span.end(this.perf.epochMillisFromOrigin(resource.responseEnd));
  }

  /**
   * Starts a span at a timing mark measured from time origin.
   * @param spanName name of span
   * @param startTime timing mark for the span start
   * @param parentSpan
   */
  private _startSpan(
    spanName: string,
    startTime: DOMHighResTimeStamp,
    parentSpan?: Span,
  ): Span {
    return this.tracer.startSpan(
      spanName,
      { startTime: this.perf.epochMillisFromOrigin(startTime) },
      parentSpan ? trace.setSpan(context.active(), parentSpan) : undefined,
    );
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

  /**
   * Sets emb.type and the PerformanceResourceTiming-derived attributes shared
   * by resource fetch spans and the document fetch span, which is emitted as
   * a resource fetch for the main document request.
   */
  private _addResourceAttributesToSpan(
    span: Span,
    resource: EmbracePerformanceResourceTiming,
  ): void {
    // Deprecated HTTP semconv keys; removing them breaks custom-exporter consumers, so they stay until 3.0
    span.setAttribute(
      ATTR_HTTP_RESPONSE_CONTENT_LENGTH,
      resource.encodedBodySize,
    );
    if (resource.decodedBodySize !== resource.encodedBodySize) {
      span.setAttribute(
        ATTR_HTTP_RESPONSE_CONTENT_LENGTH_UNCOMPRESSED,
        resource.decodedBodySize,
      );
    }

    span.setAttribute(KEY_EMB_TYPE, EMB_TYPES.ResourceFetch);

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
  }

  /**
   * Adds attributes that only make sense for the document fetch span
   */
  private _addNavigationTimingAttributesToSpan(
    span: Span,
    navigationTiming: EmbracePerformanceNavigationTiming,
  ): void {
    span.setAttribute(
      ATTR_BROWSER_NAVIGATION_TIMING_TYPE,
      navigationTiming.type,
    );

    const notRestoredReasons = getBfcacheNotRestoredReasons(navigationTiming);
    if (notRestoredReasons?.length) {
      span.setAttribute(
        KEY_BROWSER_NAVIGATION_TIMING_NOT_RESTORED_REASONS,
        notRestoredReasons,
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
   * A cross-origin resource with no Timing-Allow-Origin reports its size and
   * timing fields as 0 rather than omitting them.
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
    // notified, so the finished entry is read off the timeline instead.
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
