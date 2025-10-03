/*
 * Adapted from OpenTelemetry document-load instrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-document-load
 *
 * We extended the OpenTelemetry document-load instrumentation with the following attributes:
 *
 * 'decoded_body_size' - https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/decodedBodySize
 * 'delivery_type' - https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/deliveryType
 * 'encoded_body_size' - https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/encodedBodySize
 * 'entry_type' - https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry/entryType
 * 'initiator_type' - https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/initiatorType
 * 'render_blocking_status' - https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/renderBlockingStatus
 * 'transfer_size' - https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/transferSize
 */

import type { Span } from '@opentelemetry/api';
import { context, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { TRACE_PARENT_HEADER } from '@opentelemetry/core';
import type { PerformanceEntries as OtelPerformanceEntries } from '@opentelemetry/sdk-trace-web';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import {
  addSpanNetworkEvent,
  addSpanNetworkEvents,
  hasKey,
  PerformanceTimingNames,
} from '@opentelemetry/sdk-trace-web';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import { AttributeNames } from './enums/AttributeNames.js';
import type {
  DocumentLoadCustomAttributeFunction,
  DocumentLoadInstrumentationConfig,
  ResourceFetchCustomAttributeFunction,
} from './types.js';

import {
  ATTR_URL_FULL,
  ATTR_USER_AGENT_ORIGINAL,
  ATTR_HTTP_RESPONSE_BODY_SIZE,
  ATTR_HTTP_RESPONSE_SIZE,
} from '@opentelemetry/semantic-conventions/incubating';
import {
  addSpanPerformancePaintEvents,
  getPerformanceNavigationEntries,
} from './utils.js';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.js';
import { ATTR_HTTP_RESPONSE_STATUS_CODE } from '@opentelemetry/semantic-conventions';

/**
 * Extensions to both native PerformanceResourceTiming and OTel's PerformanceEntries.
 *
 * Why we need all these fields:
 * - OTel's PerformanceEntries is a custom type with only numeric timing fields (fetchStart, responseEnd, etc.)
 *   It's NOT the browser's native PerformanceEntry/PerformanceResourceTiming interface.
 * - Native PerformanceResourceTiming (in TypeScript's DOM lib) already has: entryType, initiatorType,
 *   responseStatus, transferSize, decodedBodySize, encodedBodySize
 * - But OTel's PerformanceEntries is missing ALL of these properties
 *
 * This extension type adds:
 * 1. For PerformanceResourceTiming: deliveryType, renderBlockingStatus (new browser features not in TS lib yet)
 * 2. For OTel's PerformanceEntries: ALL 6 fields (since OTel's type only has numeric timing properties)
 */
type EmbracePerformanceExtensions = {
  deliveryType?: string;
  entryType?: string;
  initiatorType?: string;
  renderBlockingStatus?: string;
  responseStatus?: number;
  transferSize?: number;
};

type EmbracePerformanceResourceTiming = PerformanceResourceTiming &
  EmbracePerformanceExtensions;

type PerformanceEntries = OtelPerformanceEntries & EmbracePerformanceExtensions;

const ATTR_DELIVERY_TYPE = 'delivery_type';
const ATTR_ENTRY_TYPE = 'entry_type';
const ATTR_INITIATOR_TYPE = 'initiator_type';
const ATTR_RENDER_BLOCKING_STATUS = 'render_blocking_status';
const ATTR_DECODED_BODY_SIZE = 'decoded_body_size';
const ATTR_RESOURCE_FLAGS = 'flags';

export class DocumentLoadInstrumentation extends EmbraceInstrumentationBase<DocumentLoadInstrumentationConfig> {
  private readonly _onDocumentLoaded: () => void;
  private _browserSupport?: {
    hasResponseStatus: boolean;
    hasDeliveryType: boolean;
    hasRenderBlockingStatus: boolean;
  };

  public constructor({
    diag,
    perf,
    enabled,
    applyCustomAttributesOnSpan,
    ignorePerformancePaintEvents = false,
    ignoreNetworkEvents = false,
  }: DocumentLoadInstrumentationConfig = {}) {
    super({
      instrumentationName: 'DocumentLoadInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {
        enabled,
        applyCustomAttributesOnSpan,
        ignorePerformancePaintEvents,
        ignoreNetworkEvents,
      },
    });

    this._onDocumentLoaded = () => {
      // Timeout needed because performance metrics for loadEnd aren't available until after the load event
      window.setTimeout(() => {
        this._detectBrowserSupport();
        this._collectPerformance();
      }, 0);
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  protected override init(): void {
    this._diag.debug('Initializing document load instrumentation');
    return undefined;
  }

  /**
   * Adds spans for all resources
   * @param rootSpan
   */
  private _addResourcesSpans(rootSpan: Span): void {
    const resources: EmbracePerformanceResourceTiming[] =
      performance.getEntriesByType('resource');
    resources.forEach(resource => {
      this._initResourceSpan(resource, rootSpan);
    });
  }

  /**
   * Collects information about performance and creates appropriate spans
   */
  private _collectPerformance(): void {
    const metaElement = Array.from(document.getElementsByTagName('meta')).find(
      e => e.getAttribute('name') === TRACE_PARENT_HEADER
    );
    const entries = getPerformanceNavigationEntries();
    const traceparent = (metaElement && metaElement.content) || '';
    context.with(propagation.extract(ROOT_CONTEXT, { traceparent }), () => {
      const rootSpan = this._startSpan(
        AttributeNames.DOCUMENT_LOAD,
        PerformanceTimingNames.FETCH_START,
        entries
      );
      if (!rootSpan) {
        return;
      }
      context.with(trace.setSpan(context.active(), rootSpan), () => {
        const fetchSpan = this._startSpan(
          AttributeNames.DOCUMENT_FETCH,
          PerformanceTimingNames.FETCH_START,
          entries
        );
        if (fetchSpan) {
          fetchSpan.setAttribute(ATTR_URL_FULL, location.href);
          context.with(trace.setSpan(context.active(), fetchSpan), () => {
            addSpanNetworkEvents(
              fetchSpan,
              entries,
              this.getConfig().ignoreNetworkEvents
            );
            this._addCustomAttributesOnSpan(
              fetchSpan,
              this.getConfig().applyCustomAttributesOnSpan?.documentFetch
            );
            this._endSpan(
              fetchSpan,
              PerformanceTimingNames.RESPONSE_END,
              entries
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
          entries
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.UNLOAD_EVENT_START,
          entries
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.UNLOAD_EVENT_END,
          entries
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.DOM_INTERACTIVE,
          entries
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.DOM_CONTENT_LOADED_EVENT_START,
          entries
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.DOM_CONTENT_LOADED_EVENT_END,
          entries
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.DOM_COMPLETE,
          entries
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.LOAD_EVENT_START,
          entries
        );
        addSpanNetworkEvent(
          rootSpan,
          PerformanceTimingNames.LOAD_EVENT_END,
          entries
        );
      }

      if (!this.getConfig().ignorePerformancePaintEvents) {
        addSpanPerformancePaintEvents(rootSpan);
      }

      this._addCustomAttributesOnSpan(
        rootSpan,
        this.getConfig().applyCustomAttributesOnSpan?.documentLoad
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
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private _endSpan(
    span: Span | undefined,
    performanceName: string,
    entries: PerformanceEntries
  ) {
    // Span can be undefined when entries are missing the required performance timing - no span will be created
    if (span) {
      if (
        hasKey(entries, performanceName) &&
        typeof entries[performanceName] === 'number'
      ) {
        span.end(entries[performanceName]);
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
    parentSpan: Span
  ) {
    const span = this._startSpan(
      AttributeNames.RESOURCE_FETCH,
      PerformanceTimingNames.FETCH_START,
      resource,
      parentSpan
    );
    if (!span) {
      return;
    }

    span.setAttribute(KEY_EMB_TYPE, EMB_TYPES.ResourceFetch);
    span.setAttribute(ATTR_URL_FULL, resource.name);
    addSpanNetworkEvents(span, resource, this.getConfig().ignoreNetworkEvents);

    // As of Oct 2025, Chromium only
    if (resource.deliveryType) {
      span.setAttribute(ATTR_DELIVERY_TYPE, resource.deliveryType);
    }

    if (resource.entryType) {
      span.setAttribute(ATTR_ENTRY_TYPE, resource.entryType);
    }

    if (resource.initiatorType) {
      span.setAttribute(ATTR_INITIATOR_TYPE, resource.initiatorType);
    }

    // As of Oct 2025, Chromium only
    if (resource.renderBlockingStatus) {
      span.setAttribute(
        ATTR_RENDER_BLOCKING_STATUS,
        resource.renderBlockingStatus
      );
    }

    // As of Oct 2025, no Safari support
    if (resource.responseStatus) {
      span.setAttribute(
        ATTR_HTTP_RESPONSE_STATUS_CODE,
        resource.responseStatus
      );
    }

    // Validate size fields exist and aren't negative
    if (
      typeof resource.encodedBodySize === 'number' &&
      resource.encodedBodySize >= 0
    ) {
      span.setAttribute(ATTR_HTTP_RESPONSE_BODY_SIZE, resource.encodedBodySize);
    }

    if (
      typeof resource.transferSize === 'number' &&
      resource.transferSize >= 0
    ) {
      span.setAttribute(ATTR_HTTP_RESPONSE_SIZE, resource.transferSize);
    }

    if (
      typeof resource.decodedBodySize === 'number' &&
      resource.decodedBodySize >= 0
    ) {
      span.setAttribute(ATTR_DECODED_BODY_SIZE, resource.decodedBodySize);
    }

    this._addResourceQualityFlags(span, resource);

    this._addCustomAttributesOnResourceSpan(
      span,
      resource,
      this.getConfig().applyCustomAttributesOnSpan?.resourceFetch
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
    parentSpan?: Span
  ): Span | undefined {
    if (
      hasKey(entries, performanceName) &&
      typeof entries[performanceName] === 'number'
    ) {
      const span = this.tracer.startSpan(
        spanName,
        {
          startTime: entries[performanceName],
        },
        parentSpan ? trace.setSpan(context.active(), parentSpan) : undefined
      );
      return span;
    }
    return undefined;
  }

  /**
   * Executes callback {_onDocumentLoaded} when the page is loaded
   */
  private _waitForPageLoad() {
    if (window.document.readyState === 'complete') {
      this._onDocumentLoaded();
    } else {
      window.addEventListener('load', this._onDocumentLoaded);
    }
  }

  /**
   * Adds custom attributes to root span if configured
   */
  private _addCustomAttributesOnSpan(
    span: Span,
    applyCustomAttributesOnSpan: DocumentLoadCustomAttributeFunction | undefined
  ) {
    if (applyCustomAttributesOnSpan) {
      safeExecuteInTheMiddle(
        () => {
          applyCustomAttributesOnSpan(span);
        },
        error => {
          if (!error) {
            return;
          }

          this._diag.error('addCustomAttributesOnSpan', error);
        },
        true
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
      | undefined
  ) {
    if (applyCustomAttributesOnSpan) {
      safeExecuteInTheMiddle(
        () => {
          applyCustomAttributesOnSpan(span, resource);
        },
        error => {
          if (!error) {
            return;
          }

          this._diag.error('addCustomAttributesOnResourceSpan', error);
        },
        true
      );
    }
  }

  /**
   * Detects browser support for ResourceTiming properties
   */
  private _detectBrowserSupport(): void {
    if (this._browserSupport) {
      return;
    }

    const entries = performance.getEntriesByType('resource');
    const testEntry = entries.length > 0 ? entries[0] : null;

    this._browserSupport = {
      hasResponseStatus: testEntry !== null && 'responseStatus' in testEntry,
      hasDeliveryType: testEntry !== null && 'deliveryType' in testEntry,
      hasRenderBlockingStatus:
        testEntry !== null && 'renderBlockingStatus' in testEntry,
    };

    this._diag.debug('Browser ResourceTiming support detected', {
      responseStatus: this._browserSupport.hasResponseStatus,
      deliveryType: this._browserSupport.hasDeliveryType,
      renderBlockingStatus: this._browserSupport.hasRenderBlockingStatus,
    });
  }

  /**
   * Flags indicate browser limitations or CORS restrictions that prevent full timing visibility
   */
  private _addResourceQualityFlags(
    span: Span,
    resource: EmbracePerformanceResourceTiming
  ): void {
    const resourceQualityFlags: string[] = [];

    // As of Oct 2025, no Safari support
    if (this._browserSupport && !this._browserSupport.hasResponseStatus) {
      resourceQualityFlags.push('browser_missing_response_status');
    }

    // Check for CORS-restricted timing data vs actual failures
    const transferSize =
      typeof resource.transferSize === 'number' ? resource.transferSize : 0;
    const decodedBodySize =
      typeof resource.decodedBodySize === 'number'
        ? resource.decodedBodySize
        : 0;
    const encodedBodySize =
      typeof resource.encodedBodySize === 'number'
        ? resource.encodedBodySize
        : 0;

    const hasNoSizeData =
      transferSize === 0 && decodedBodySize === 0 && encodedBodySize === 0;

    if (hasNoSizeData) {
      // Has timing data but no size - likely cross-origin without Timing-Allow-Origin header
      const fetchStart =
        typeof resource.fetchStart === 'number' ? resource.fetchStart : 0;
      const responseEnd =
        typeof resource.responseEnd === 'number' ? resource.responseEnd : 0;

      const hasTimingData = fetchStart > 0 && responseEnd > 0;

      if (hasTimingData) {
        resourceQualityFlags.push('cors_restricted');
      } else {
        // No timing or size data - request likely failed or was aborted
        resourceQualityFlags.push('failed_request');
      }
    }

    // 304 Not Modified responses typically show 300 bytes transferSize (HTTP headers only, no body)
    // This indicates cache revalidation occurred:
    // https://w3c.github.io/resource-timing/#dom-performanceresourcetiming-transfersize
    const deliveryType =
      typeof resource.deliveryType === 'string' ? resource.deliveryType : '';

    if (transferSize === 300 && deliveryType !== 'cache') {
      resourceQualityFlags.push('cache_validated');
    }

    if (resourceQualityFlags.length > 0) {
      span.setAttribute(ATTR_RESOURCE_FLAGS, resourceQualityFlags.join(','));
    }
  }

  public enable(): void {
    window.removeEventListener('load', this._onDocumentLoaded);
    this._waitForPageLoad();
  }

  public disable(): void {
    window.removeEventListener('load', this._onDocumentLoaded);
  }
}
