/*
 * Adapted from OpenTelemetry document-load instrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-document-load
 */

import type { Span } from '@opentelemetry/api';
import type { PerformanceEntries } from '@opentelemetry/sdk-trace-web';
import { hasKey, PerformanceTimingNames } from '@opentelemetry/sdk-trace-web';
import type { PerformanceManager } from '../../../utils/index.ts';
import {
  getBfcacheNotRestoredReasons,
  getNonBaselineNavigationTiming,
} from '../../../utils/index.ts';
import { EventNames } from './enums/EventNames.ts';

/**
 * Adds new browser features not yet in TypeScript's DOM lib (as of Oct 2025):
 * - deliveryType: Chromium only (experimental) https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/deliveryType
 * - renderBlockingStatus: Chromium only https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/renderBlockingStatus
 */
export type EmbracePerformanceResourceTiming = PerformanceResourceTiming & {
  deliveryType?: 'cache' | '';
  renderBlockingStatus?: 'blocking' | 'non-blocking';
};

/**
 * PerformanceTimingNames only covers navigation timing marks, so transferSize,
 * initiatorType, responseStatus, deliveryType, renderBlockingStatus, type and
 * notRestoredReasons - all present on the underlying PerformanceNavigationTiming
 * entry - are read separately below. This lets the document fetch span carry
 * the same attributes as resource fetch spans, plus the navigation-specific
 * ones no resource entry ever has.
 */
export type EmbracePerformanceNavigationEntries = PerformanceEntries & {
  transferSize?: number;
  initiatorType?: string;
  responseStatus?: number;
  deliveryType?: 'cache' | '';
  renderBlockingStatus?: 'blocking' | 'non-blocking';
  type?: NavigationTimingType;
  notRestoredReasons?: string[];
};

export const getPerformanceNavigationEntries =
  (): EmbracePerformanceNavigationEntries => {
    const entries: EmbracePerformanceNavigationEntries = {};
    const performanceNavigationTiming = getNonBaselineNavigationTiming();
    if (!performanceNavigationTiming) {
      return entries;
    }

    const keys = Object.values(PerformanceTimingNames);
    keys.forEach((key: PerformanceTimingNames) => {
      if (hasKey(performanceNavigationTiming, key)) {
        const value = performanceNavigationTiming[key];
        if (typeof value === 'number') {
          entries[key] = value;
        }
      }
    });

    entries.transferSize = performanceNavigationTiming.transferSize;
    entries.initiatorType = performanceNavigationTiming.initiatorType;
    entries.responseStatus = performanceNavigationTiming.responseStatus;
    entries.deliveryType = performanceNavigationTiming.deliveryType;
    entries.renderBlockingStatus =
      performanceNavigationTiming.renderBlockingStatus;
    entries.type = performanceNavigationTiming.type;
    entries.notRestoredReasons = getBfcacheNotRestoredReasons(
      performanceNavigationTiming,
    );

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
