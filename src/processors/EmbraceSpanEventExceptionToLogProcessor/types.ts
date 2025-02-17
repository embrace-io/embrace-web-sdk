import { TimedEvent } from '@opentelemetry/sdk-trace-web';
import { Attributes } from '@opentelemetry/api';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';
import { LogAttributes, LogRecord } from '@opentelemetry/api-logs';

export interface ExceptionEvent extends TimedEvent {
  attributes: Attributes &
    (
      | {
          // available when the captured exception has a `code` or a `name` property
          [ATTR_EXCEPTION_TYPE]: string;
        }
      | {
          // available when the captured exception is just a string, or an object including a `message` property
          [ATTR_EXCEPTION_MESSAGE]: string;
        }
      | {
          // available when the captured exception is an object with a `stack` property
          [ATTR_EXCEPTION_STACKTRACE]: string;
        }
    );
}

export const isExceptionEvent = (
  spanEvent: ExceptionEvent | TimedEvent
): spanEvent is ExceptionEvent => {
  return !!(
    spanEvent.attributes &&
    (spanEvent.attributes[ATTR_EXCEPTION_TYPE] ||
      spanEvent.attributes[ATTR_EXCEPTION_MESSAGE] ||
      spanEvent.attributes[ATTR_EXCEPTION_STACKTRACE])
  );
};

export interface EmbraceLogRecord extends LogRecord {
  attributes: LogAttributes;
}
