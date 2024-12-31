import {SpanProcessor, TimedEvent} from '@opentelemetry/sdk-trace-web';
import {ReadableSpan} from '@opentelemetry/sdk-trace-base/build/src/export/ReadableSpan';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_TYPE,
  ATTR_EXCEPTION_STACKTRACE,
} from '@opentelemetry/semantic-conventions';
import {Logger, SeverityNumber} from '@opentelemetry/api-logs';
import {
  KEY_EMB_TYPE,
  EMB_TYPES,
  KEY_JS_EXCEPTION,
} from '../constants/attributes';
import generateUUID from '../utils/generateUUID';

/**
  Embrace's API uses logs internally to track exceptions. This processor converts span events with exception attributes
  to logs.
 */
class EmbraceSpanEventExceptionToLogProcessor implements SpanProcessor {
  constructor(private _logger: Logger) {}

  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    const exceptionEvents = span.events.filter(
      event =>
        event.attributes &&
        event.attributes[ATTR_EXCEPTION_TYPE] &&
        event.attributes[ATTR_EXCEPTION_MESSAGE],
    );

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

  private _emitEmbraceExceptionLog(event: TimedEvent) {
    const attributes = event.attributes || {};

    this._logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: '',
      attributes: {
        ...attributes,
        [KEY_EMB_TYPE]: EMB_TYPES.Exception,
        [KEY_JS_EXCEPTION]: JSON.stringify({
          id: generateUUID(),
          m: attributes[ATTR_EXCEPTION_MESSAGE],
          n: attributes[ATTR_EXCEPTION_TYPE],
          st: attributes[ATTR_EXCEPTION_STACKTRACE],
          t: 'Error',
        }),
      },
    });
  }
}

export default EmbraceSpanEventExceptionToLogProcessor;
