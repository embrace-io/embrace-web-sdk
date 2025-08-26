/*
 * Adapted from OpenTelemetry document-load instrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-document-load
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
  ATTR_HTTP_USER_AGENT,
  ATTR_HTTP_RESPONSE_BODY_SIZE,
  ATTR_HTTP_RESPONSE_SIZE,
} from '@opentelemetry/semantic-conventions/incubating';
import {
  addSpanPerformancePaintEvents,
  getPerformanceNavigationEntries,
} from './utils.js';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.js';
import { ATTR_HTTP_RESPONSE_STATUS_CODE } from '@opentelemetry/semantic-conventions';

type EmbracePerformanceResourceTiming = PerformanceResourceTiming & {
  deliveryType?: string;
  entryType?: string;
  initiatorType?: string;
  renderBlockingStatus?: string;
  transferSize?: number;
};

type PerformanceEntries = OtelPerformanceEntries & {
  deliveryType?: string;
  entryType?: string;
  initiatorType?: string;
  renderBlockingStatus?: string;
  responseStatus?: number;
  transferSize?: number;
};

const ATTR_DELIVERY_TYPE = 'delivery_type';
const ATTR_ENTRY_TYPE = 'entry_type';
const ATTR_INITIATOR_TYPE = 'initiator_type';
const ATTR_RENDER_BLOCKING_STATUS = 'render_blocking_status';
const ATTR_DECODED_BODY_SIZE = 'decoded_body_size';

export class DocumentLoadInstrumentation extends EmbraceInstrumentationBase<DocumentLoadInstrumentationConfig> {
  private readonly _onDocumentLoaded: () => void;

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
      // Timeout is needed as load event doesn't have yet the performance metrics for loadEnd
      window.setTimeout(() => {
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
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      rootSpan.setAttribute(ATTR_HTTP_USER_AGENT, navigator.userAgent);

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
   * Helper function for ending span
   * @param span
   * @param performanceName name of performance entry for time end
   * @param entries
   */
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private _endSpan(
    span: Span | undefined,
    performanceName: string,
    entries: PerformanceEntries
  ) {
    // span can be undefined when entries are missing the certain performance - the span will not be created
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
   * Creates and ends a span with network information about resource added as timed events
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
    if (span) {
      span.setAttribute(KEY_EMB_TYPE, EMB_TYPES.ResourceFetch);
      span.setAttribute(ATTR_URL_FULL, resource.name);
      addSpanNetworkEvents(
        span,
        resource,
        this.getConfig().ignoreNetworkEvents
      );
      if (resource.deliveryType) {
        span.setAttribute(ATTR_DELIVERY_TYPE, resource.deliveryType);
      }
      span.setAttribute(ATTR_ENTRY_TYPE, resource.entryType);
      span.setAttribute(ATTR_INITIATOR_TYPE, resource.initiatorType);
      if (resource.renderBlockingStatus) {
        span.setAttribute(
          ATTR_RENDER_BLOCKING_STATUS,
          resource.renderBlockingStatus
        );
      }
      span.setAttribute(
        ATTR_HTTP_RESPONSE_STATUS_CODE,
        resource.responseStatus
      );
      span.setAttribute(ATTR_HTTP_RESPONSE_BODY_SIZE, resource.encodedBodySize);
      span.setAttribute(ATTR_HTTP_RESPONSE_SIZE, resource.transferSize);
      span.setAttribute(ATTR_DECODED_BODY_SIZE, resource.decodedBodySize);

      this._addCustomAttributesOnResourceSpan(
        span,
        resource,
        this.getConfig().applyCustomAttributesOnSpan?.resourceFetch
      );
      this._endSpan(span, PerformanceTimingNames.RESPONSE_END, resource);
    }
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
   * executes callback {_onDocumentLoaded} when the page is loaded
   */
  private _waitForPageLoad() {
    if (window.document.readyState === 'complete') {
      this._onDocumentLoaded();
    } else {
      window.addEventListener('load', this._onDocumentLoaded);
    }
  }

  /**
   * adds custom attributes to root span if configured
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
   * adds custom attributes to span if configured
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

  public enable(): void {
    window.removeEventListener('load', this._onDocumentLoaded);
    this._waitForPageLoad();
  }

  public disable(): void {
    window.removeEventListener('load', this._onDocumentLoaded);
  }
}
