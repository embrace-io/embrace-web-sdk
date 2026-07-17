import { diag } from '@opentelemetry/api';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import { KEY_EMB_SOFT_NAVIGATION_SOURCE } from '../../instrumentations/soft-navigation-performance/SoftNavigationPerformanceInstrumentation/constants.ts';
import type { SignalBuffer } from '../utils/SignalBuffer.ts';
import type { SignalCorrelationSpanProcessorArgs } from './types.ts';

const isSoftNavigationSpan = (span: ReadableSpan | Span): boolean =>
  span.attributes[KEY_EMB_SOFT_NAVIGATION_SOURCE] !== undefined;

const isSessionPartSpan = (span: ReadableSpan | Span): boolean =>
  span.attributes[KEY_EMB_TYPE] === EMB_TYPES.SessionPart;

/**
 * Records eligible spans as they start into a shared buffer, so a
 * soft-navigation span can later correlate the logs and spans that started
 * within its window.
 */
export class SignalCorrelationSpanProcessor implements SpanProcessor {
  private readonly _buffer: SignalBuffer;

  public constructor({ buffer }: SignalCorrelationSpanProcessorArgs) {
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
        type: span.attributes[KEY_EMB_TYPE] as string | undefined,
      });
    } catch (e) {
      diag.error('failed to record span for soft-navigation correlation', e);
    }
  }

  public onEnd(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
