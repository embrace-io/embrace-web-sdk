import type { AttributeValue } from '@opentelemetry/api';

export type LogMessageOptions = {
  attributes?: Record<string, AttributeValue | undefined>;
  includeStacktrace?: boolean;
  stacktrace?: string;
};

export type LogExceptionOptions = {
  handled?: boolean;
  attributes?: Record<string, AttributeValue | undefined>;
  /**
   * When the exception happened, in epoch milliseconds (e.g. Date.now()). Defaults to now. A
   * performance.now()-based value is read as timeOrigin + value, which is off by any time the
   * machine slept.
   */
  timestamp?: number;
  handler?: ExceptionHandlerType;
};

export interface LogManager {
  message: (
    message: string,
    level: LogSeverity,
    options?: LogMessageOptions,
  ) => void;

  logException: (error: unknown, options?: LogExceptionOptions) => void;
}

export type LogSeverity = 'info' | 'warning' | 'error';

export type ExceptionHandlerType =
  | 'global_exception'
  | 'promise_rejection'
  | 'manual';
