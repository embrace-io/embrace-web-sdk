import type { AttributeValue } from '@opentelemetry/api';

export interface LogManager {
  message: (
    message: string,
    level: LogSeverity,
    attributes?: Record<string, AttributeValue | undefined>,
    includeStacktrace?: boolean
  ) => void;

  logException: (
    timestamp: number,
    error: Error,
    handled: boolean,
    attributes?: Record<string, AttributeValue | undefined>
  ) => void;
}

export type LogSeverity = 'info' | 'warning' | 'error';
