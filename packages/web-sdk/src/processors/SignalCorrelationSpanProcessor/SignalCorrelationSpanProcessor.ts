import { diag } from '@opentelemetry/api';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import { KEY_EMB_TYPE } from '../../constants/index.ts';
import { isSessionPartSpan, isSoftNavigationSpan } from '../../utils/index.ts';
import type { SignalBuffer } from '../utils/SignalBuffer.ts';
import type { SignalCorrelationSpanProcessorArgs } from './types.ts';

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
      diag.error('failed to record span for correlation', e);
    }
  }

  public onEnd(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
