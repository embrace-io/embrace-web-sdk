import type { AttributeValue } from '@opentelemetry/api';

export type LogMessageOptions = {
  attributes?: Record<string, AttributeValue | undefined>;
  includeStacktrace?: boolean;
};

export type LogExceptionOptions = {
  handled?: boolean;
  attributes?: Record<string, AttributeValue | undefined>;
  timestamp?: number;
};

export interface LogManager {
  message: (
    message: string,
    level: LogSeverity,
    options?: LogMessageOptions
  ) => void;

  logException: (error: Error, options?: LogExceptionOptions) => void;
}

export type LogSeverity = 'info' | 'warning' | 'error';
