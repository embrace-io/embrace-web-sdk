import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
} from '@opentelemetry/semantic-conventions';
import { Logger, SeverityNumber } from '@opentelemetry/api-logs';
import { KEY_JS_EXCEPTION_STACKTRACE } from '../../constants/index.js';
import { EmbraceLogRecord, ExceptionEvent, isExceptionEvent } from './types.js';
import { BILLION } from '../EmbraceSpanEventWebVitalsSpanProcessor/constants.js';

/**
 Embrace's API uses logs internally to track exceptions. This processor converts span events with exception attributes
 to logs.
 */
export class EmbraceSpanEventExceptionToLogProcessor implements SpanProcessor {
  constructor(private _logger: Logger) {}

  onStart(): void {}

  onEnd(span: ReadableSpan): void {
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
    // event.time[0] has seconds, so multiply by 1 billion to get nanoseconds, then add the nanoseconds part
    // NOTE: time is actually the time when the web vitals instrumentation reported a change in the metric, not what
    // EmbraceSpanEventWebViewInfo expects, which is the start time of the measurement. We'll set the start time to
    // comply with the expected format until the BE accepts a better format
    const time = event.time[0] * BILLION + event.time[1];
    const embraceLogRecord: EmbraceLogRecord = {
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      time_unix_nano: time,
      body: event.attributes[ATTR_EXCEPTION_MESSAGE],
      attributes: {
        ...event.attributes,
        [KEY_JS_EXCEPTION_STACKTRACE]: JSON.stringify(
          event.attributes[ATTR_EXCEPTION_STACKTRACE]
        ),
      },
    };
    // need to remove the exception stack trace from the attributes since it's already sent as a separate attribute and Embrace interprets the log as android if ATTR_EXCEPTION_STACKTRACE is present
    delete embraceLogRecord.attributes[ATTR_EXCEPTION_STACKTRACE];
    this._logger.emit(embraceLogRecord);
  }
}
