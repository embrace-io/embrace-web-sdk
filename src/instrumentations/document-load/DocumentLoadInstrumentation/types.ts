/*
 * Adapted from OpenTelemetry document-load instrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-document-load
 */

import type { Span } from '@opentelemetry/api';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export interface DocumentLoadCustomAttributeFunction {
  (span: Span): void;
}

export interface ResourceFetchCustomAttributeFunction {
  (span: Span, resource: PerformanceResourceTiming): void;
}

export type DocumentLoadInstrumentationConfig = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf'
> & {
  /** Function for adding custom attributes on the document load, document fetch and or resource fetch spans */
  applyCustomAttributesOnSpan?: {
    documentLoad?: DocumentLoadCustomAttributeFunction;
    documentFetch?: DocumentLoadCustomAttributeFunction;
    resourceFetch?: ResourceFetchCustomAttributeFunction;
  };

  /** Ignore adding network events as span events for document fetch and resource fetch spans.
   * This instrumentation will send the following span events by default:
   * connectEnd
   * connectStart
   * decodedBodySize
   * domComplete
   * domContentLoadedEventEnd
   * domContentLoadedEventStart
   * domInteractive
   * domainLookupEnd
   * domainLookupStart
   * encodedBodySize
   * fetchStart
   * loadEventEnd
   * loadEventStart
   * navigationStart
   * redirectEnd
   * redirectStart
   * requestStart
   * responseEnd
   * responseStart
   * secureConnectionStart
   * unloadEventEnd
   * unloadEventStart
   */
  ignoreNetworkEvents?: boolean;

  /** Ignore adding performance paint span events on document load spans
   * This instrumentation will send the following span events by default:
   * firstContentfulPaint
   * firstPaint
   */
  ignorePerformancePaintEvents?: boolean;

  /** Whether the instrumentation is enabled */
  enabled?: boolean;
};
