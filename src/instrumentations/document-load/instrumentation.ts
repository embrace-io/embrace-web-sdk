/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Span } from '@opentelemetry/api';
import { context, propagation, trace, ROOT_CONTEXT } from '@opentelemetry/api';
import { TRACE_PARENT_HEADER } from '@opentelemetry/core';
import type { PerformanceEntries as OtelPerformanceEntries } from '@opentelemetry/sdk-trace-web';

import {
  addSpanNetworkEvent,
  addSpanNetworkEvents,
  hasKey,
  PerformanceTimingNames,
} from '@opentelemetry/sdk-trace-web';
import {
  InstrumentationBase,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import type {
  DocumentLoadCustomAttributeFunction,
  DocumentLoadInstrumentationConfig,
  ResourceFetchCustomAttributeFunction,
} from './types.js';
import { AttributeNames } from './enums/AttributeNames.js';

type EmbracePerformanceResourceTiming = PerformanceResourceTiming & {};

import {
  addSpanPerformancePaintEvents,
  getPerformanceNavigationEntries,
} from './utils.js';
import {
  ATTR_HTTP_URL,
  ATTR_HTTP_USER_AGENT,
} from '@opentelemetry/semantic-conventions/incubating';

const PACKAGE_NAME = '@opentelemetry/instrumentation-document-load';
const PACKAGE_VERSION = '1.0.0';
const otperformance = window.performance;

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
const ATTR_RESPONSE_STATUS = 'response_status';
const ATTR_TRANSFER_SIZE = 'transfer_size';

export class DocumentLoadInstrumentation extends InstrumentationBase<DocumentLoadInstrumentationConfig> {
  public readonly component: string = 'DocumentLoadInstrumentation';
  public readonly version: string = '1.0.0';
  private readonly _boundOnDocumentLoaded: () => void;

  public constructor(config: DocumentLoadInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this._boundOnDocumentLoaded = this._onDocumentLoaded.bind(this);
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  public init() {}

  /**
   * callback to be executed when page is loaded
   */
  private _onDocumentLoaded() {
    // Timeout is needed as load event doesn't have yet the performance metrics for loadEnd.
    // Support for event "loadend" is very limited and cannot be used
    window.setTimeout(() => {
      this._collectPerformance();
    });
  }

  /**
   * Adds spans for all resources
   * @param rootSpan
   */
  private _addResourcesSpans(rootSpan: Span): void {
    const resources: EmbracePerformanceResourceTiming[] =
      otperformance.getEntriesByType('resource');
    resources.forEach(resource => {
      this._initResourceSpan(resource, rootSpan);
    });
  }

  /**
   * Collects information about performance and creates appropriate spans
   */
  private _collectPerformance() {
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
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          fetchSpan.setAttribute(ATTR_HTTP_URL, location.href);
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

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      rootSpan.setAttribute(ATTR_HTTP_URL, location.href);
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
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      span.setAttribute(ATTR_HTTP_URL, resource.name);
      addSpanNetworkEvents(
        span,
        resource,
        this.getConfig().ignoreNetworkEvents
      );

      span.setAttribute(
        PerformanceTimingNames.DECODED_BODY_SIZE,
        resource.decodedBodySize
      );
      span.setAttribute(
        ATTR_DELIVERY_TYPE,
        // @ts-expect-error otel has an incomplete implementation
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        resource.deliveryType
      );
      span.setAttribute(
        PerformanceTimingNames.ENCODED_BODY_SIZE,
        resource.encodedBodySize
      );
      span.setAttribute(ATTR_ENTRY_TYPE, resource.entryType);
      span.setAttribute(ATTR_INITIATOR_TYPE, resource.initiatorType);
      span.setAttribute(
        ATTR_RENDER_BLOCKING_STATUS,
        // @ts-expect-error otel has an incomplete implementation
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        resource.renderBlockingStatus
      );
      span.setAttribute(ATTR_RESPONSE_STATUS, resource.responseStatus);
      span.setAttribute(ATTR_TRANSFER_SIZE, resource.transferSize);

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
      window.addEventListener('load', this._boundOnDocumentLoaded);
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

  /**
   * implements enable function
   */
  public override enable() {
    // remove previously attached load to avoid adding the same event twice
    // in case of multiple enable calling.
    window.removeEventListener('load', this._boundOnDocumentLoaded);
    this._waitForPageLoad();
  }

  /**
   * implements disable function
   */
  public override disable() {
    window.removeEventListener('load', this._boundOnDocumentLoaded);
  }
}
