import { diag } from '@opentelemetry/api';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import {
  KEY_EMB_SOFT_NAVIGATION_LOG_IDS,
  KEY_EMB_SOFT_NAVIGATION_SOURCE,
  KEY_EMB_SOFT_NAVIGATION_SPAN_IDS,
} from '../../instrumentations/soft-navigation-performance/SoftNavigationPerformanceInstrumentation/constants.ts';
import type { SoftNavigationSignalBuffer } from '../utils/SoftNavigationSignalBuffer.ts';
import type { SoftNavigationCorrelationSpanProcessorArgs } from './types.ts';

const isSoftNavigationSpan = (span: ReadableSpan | Span): boolean =>
  span.attributes[KEY_EMB_SOFT_NAVIGATION_SOURCE] !== undefined;

const isSessionPartSpan = (span: ReadableSpan | Span): boolean =>
  span.attributes[KEY_EMB_TYPE] === EMB_TYPES.SessionPart;

/**
 * Records eligible spans as they start and, when a soft-navigation span ends,
 * stamps it with the ids of the logs and non-part, non-soft-navigation spans
 * that started within its window.
 */
export class SoftNavigationCorrelationSpanProcessor implements SpanProcessor {
  private readonly _buffer: SoftNavigationSignalBuffer;

  public constructor({ buffer }: SoftNavigationCorrelationSpanProcessorArgs) {
    this._buffer = buffer;
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onStart(span: Span): void {
    try {
      if (isSoftNavigationSpan(span) || isSessionPartSpan(span)) {
        return;
      }
      this._buffer.record({
        kind: 'span',
        id: span.spanContext().spanId,
        startTime: hrTimeToMilliseconds(span.startTime),
      });
    } catch (e) {
      diag.error('failed to record span for soft-navigation correlation', e);
    }
  }

  public onEnding(span: Span): void {
    try {
      if (!isSoftNavigationSpan(span)) {
        return;
      }
      const { spanIds, logIds } = this._buffer.collectWindow(
        hrTimeToMilliseconds(span.startTime),
        hrTimeToMilliseconds(span.endTime),
      );
      span.attributes[KEY_EMB_SOFT_NAVIGATION_SPAN_IDS] = spanIds;
      span.attributes[KEY_EMB_SOFT_NAVIGATION_LOG_IDS] = logIds;
    } catch (e) {
      diag.error('failed to stamp soft-navigation correlation attributes', e);
    }
  }

  public onEnd(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
