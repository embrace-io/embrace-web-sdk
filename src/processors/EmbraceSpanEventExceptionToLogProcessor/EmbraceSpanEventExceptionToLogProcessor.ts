import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
} from '@opentelemetry/semantic-conventions';
import { Logger } from '@opentelemetry/api-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import { ExceptionEvent, isExceptionEvent } from './types.js';
import { logMessage } from '../../utils/log.js';
import { hrTimeToMilliseconds } from '@opentelemetry/core/build/src/common/time';

/**
 Embrace's API uses logs internally to track exceptions. This processor converts span events with exception attributes
 to logs.
 */
export class EmbraceSpanEventExceptionToLogProcessor implements SpanProcessor {
  constructor(private _logger: Logger) {}

  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    // We already handle emitting logs for exceptions that happen on the Session span in
    // src/instrumentations/exceptions/GlobalExceptionInstrumentation/GlobalExceptionInstrumentation.ts
    if (span.attributes[KEY_EMB_TYPE] === EMB_TYPES.Session) {
      return;
    }

    const exceptionEvents = span.events.filter(isExceptionEvent);

    for (const event of exceptionEvents) {
      this._emitEmbraceExceptionLog(event);
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }

  private _emitEmbraceExceptionLog(event: ExceptionEvent) {
    const message = event.attributes[ATTR_EXCEPTION_MESSAGE];

    if (!message) {
      return;
    }

    const properties = { ...event.attributes };
    // need to remove the exception stack trace from the attributes since it's already sent as a separate attribute and Embrace interprets the log as android if ATTR_EXCEPTION_STACKTRACE is present
    delete properties[ATTR_EXCEPTION_STACKTRACE];

    logMessage(
      this._logger,
      message.toString(),
      'error',
      hrTimeToMilliseconds(event.time),
      properties,
      event.attributes[ATTR_EXCEPTION_STACKTRACE]?.toString()
    );
  }
}
