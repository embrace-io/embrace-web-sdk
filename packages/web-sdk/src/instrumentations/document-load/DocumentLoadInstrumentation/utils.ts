/*
 * Adapted from OpenTelemetry document-load instrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-document-load
 */

import type { Span } from '@opentelemetry/api';
import type { PerformanceManager } from '../../../utils/index.ts';
import { EventNames } from './enums/EventNames.ts';

const RESOURCE_TIMING_MARKS = [
  'fetchStart',
  'domainLookupStart',
  'domainLookupEnd',
  'connectStart',
  'secureConnectionStart',
  'connectEnd',
  'requestStart',
  'responseStart',
  'responseEnd',
] as const;

/*
 * Adapted from OpenTelemetry sdk-trace-web
 * https://github.com/open-telemetry/opentelemetry-js/blob/v2.12.0/packages/opentelemetry-sdk-trace-web/src/utils.ts
 */
export const addSpanNetworkEvent = (
  span: Span,
  perf: PerformanceManager,
  name: string,
  offset: number,
  ignoreZeros = true,
) => {
  // Timing APIs report an unrecorded or hidden mark as 0 (no prior document, opaque
  // cross-origin entry); converting it would fabricate an event at time origin
  // https://w3c.github.io/resource-timing/#dfn-convert-fetch-timestamp
  // https://w3c.github.io/navigation-timing/#dom-performancenavigationtiming-unloadeventstart
  if (!(ignoreZeros && offset === 0)) {
    span.addEvent(name, perf.epochMillisFromOrigin(offset));
  }
};

export const addSpanNetworkEvents = (
  span: Span,
  perf: PerformanceManager,
  entry: PerformanceResourceTiming,
) => {
  // A navigation entry starts at time origin, so its marks can be a real 0
  const ignoreZeros = entry.startTime !== 0;
  for (const name of RESOURCE_TIMING_MARKS) {
    addSpanNetworkEvent(span, perf, name, entry[name], ignoreZeros);
  }
};

/**
 * Adds new browser features not yet in TypeScript's DOM lib (as of Oct 2025):
 * - deliveryType: Chromium only (experimental) https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/deliveryType
 * - renderBlockingStatus: Chromium only https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/renderBlockingStatus
 */
export type EmbracePerformanceResourceTiming = PerformanceResourceTiming & {
  deliveryType?: 'cache' | '';
  renderBlockingStatus?: 'blocking' | 'non-blocking';
};

const performancePaintNames: Partial<Record<string, EventNames>> = {
  'first-paint': EventNames.FIRST_PAINT,
  'first-contentful-paint': EventNames.FIRST_CONTENTFUL_PAINT,
};

export const addSpanPerformancePaintEvents = (
  span: Span,
  perf: PerformanceManager,
) => {
  const performancePaintTiming = window.performance.getEntriesByType('paint');
  performancePaintTiming.forEach(({ name, startTime }) => {
    const eventName = performancePaintNames[name];
    if (eventName) {
      span.addEvent(eventName, perf.epochMillisFromOrigin(startTime));
    }
  });
};
