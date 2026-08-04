import type { AttributeValue } from '@opentelemetry/api';

export type LogMessageOptions = {
  attributes?: Record<string, AttributeValue | undefined>;
  includeStacktrace?: boolean;
  stacktrace?: string;
};

export type LogExceptionOptions = {
  handled?: boolean;
  attributes?: Record<string, AttributeValue | undefined>;
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

  /**
   * Exports any logs still held in the batch buffer instead of waiting for the
   * next scheduled export. Useful before a deliberate teardown, and gives tests
   * a known point to drain from rather than racing the export schedule.
   *
   * Resolves once the export settles and never rejects: failures are reported
   * on the diagnostic channel. Note the safe-proxy wrapper around the public
   * API only traps synchronous throws, so this must absorb its own rejections.
   */
  flush: () => Promise<void>;
}

export type LogSeverity = 'info' | 'warning' | 'error';

export type ExceptionHandlerType =
  | 'global_exception'
  | 'promise_rejection'
  | 'manual';
