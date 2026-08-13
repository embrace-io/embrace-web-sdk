/*
 * Adapted from OpenTelemetry document-load instrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-document-load
 */

import type { Span } from '@opentelemetry/api';
import type { PerformanceEntries } from '@opentelemetry/sdk-trace-web';
import { hasKey, PerformanceTimingNames } from '@opentelemetry/sdk-trace-web';
import type { PerformanceManager } from '../../../utils/index.ts';
import { EventNames } from './enums/EventNames.ts';

/**
 * Reads the timing fields off the document's navigation timing entry. There is
 * one such entry per document and the browser mutates it in place as the load
 * progresses, so reading it after the load event completes is what yields the
 * completed values.
 */
export const getPerformanceNavigationEntries = (): PerformanceEntries => {
  const entries: PerformanceEntries = {};
  const [navigationTiming] = window.performance.getEntriesByType('navigation');

  if (!navigationTiming) {
    return entries;
  }

  const keys = Object.values(PerformanceTimingNames);
  keys.forEach((key: PerformanceTimingNames) => {
    if (hasKey(navigationTiming, key)) {
      const value = navigationTiming[key];
      if (typeof value === 'number') {
        entries[key] = value;
      }
    }
  });

  return entries;
};

const performancePaintNames = {
  'first-paint': EventNames.FIRST_PAINT,
  'first-contentful-paint': EventNames.FIRST_CONTENTFUL_PAINT,
};

export const addSpanPerformancePaintEvents = (
  span: Span,
  perf: PerformanceManager,
) => {
  const performancePaintTiming = window.performance.getEntriesByType('paint');
  performancePaintTiming.forEach(({ name, startTime }) => {
    if (hasKey(performancePaintNames, name)) {
      span.addEvent(
        performancePaintNames[name],
        perf.epochMillisFromOrigin(startTime),
      );
    }
  });
};
