/*
 * Adapted from OpenTelemetry document-load instrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-document-load
 */

import type { Span } from '@opentelemetry/api';
import type { PerformanceEntries } from '@opentelemetry/sdk-trace-web';
import { hasKey, PerformanceTimingNames } from '@opentelemetry/sdk-trace-web';
import { EventNames } from './enums/EventNames.ts';

export const getPerformanceNavigationEntries = (): PerformanceEntries => {
  const entries: PerformanceEntries = {};
  const performanceNavigationTiming =
    window.performance.getEntriesByType('navigation')[0];

  const keys = Object.values(PerformanceTimingNames);
  keys.forEach((key: PerformanceTimingNames) => {
    if (hasKey(performanceNavigationTiming, key)) {
      const value = performanceNavigationTiming[key];
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

export const addSpanPerformancePaintEvents = (span: Span) => {
  const performancePaintTiming = window.performance.getEntriesByType('paint');
  performancePaintTiming.forEach(({ name, startTime }) => {
    if (hasKey(performancePaintNames, name)) {
      span.addEvent(performancePaintNames[name], startTime);
    }
  });
};
