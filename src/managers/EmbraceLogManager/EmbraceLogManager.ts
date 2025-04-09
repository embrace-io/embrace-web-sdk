import { type AttributeValue } from '@opentelemetry/api';
import type { LogManager } from '../../api-logs/index.js';
import type { LogSeverity } from '../../api-logs/manager/types.js';
import type { Logger } from '@opentelemetry/api-logs';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import {
  EMB_TYPES,
  KEY_EMB_JS_EXCEPTION_STACKTRACE,
  KEY_EMB_TYPE,
} from '../../constants/index.js';
import {
  OTelPerformanceManager,
  type PerformanceManager,
} from '../../utils/index.js';
import type { EmbraceLogManagerArgs } from './types.js';

export class EmbraceLogManager implements LogManager {
  private readonly _perf: PerformanceManager;
  private readonly _logger: Logger;

  public constructor({ perf }: EmbraceLogManagerArgs = {}) {
    this._perf = perf ?? new OTelPerformanceManager();
    this._logger = logs.getLogger('embrace-web-sdk-logs');
  }

  public message(
    message: string,
    severity: LogSeverity,
    attributes?: Record<string, AttributeValue | undefined>,
    includeStacktrace = true
  ) {
    this._logMessage({
      message,
      severity,
      timestamp: this._perf.getNowMillis(),
      attributes,
      stackTrace:
        includeStacktrace && severity != 'info' ? new Error().stack : undefined,
    });
  }

  private _logMessage({
    message,
    severity,
    timestamp,
    attributes = {},
    stackTrace,
  }: {
    message: string;
    severity: LogSeverity;
    timestamp: number;
    attributes?: Record<string, AttributeValue | undefined>;
    stackTrace?: string;
  }) {
    this._logger.emit({
      timestamp,
      severityNumber: EmbraceLogManager._logSeverityToSeverityNumber(severity),
      severityText: severity.toUpperCase(),
      body: message,
      attributes: {
        ...attributes,
        [KEY_EMB_TYPE]: EMB_TYPES.SystemLog,
        ...(stackTrace
          ? {
              [KEY_EMB_JS_EXCEPTION_STACKTRACE]: stackTrace,
            }
          : {}),
      },
    });
  }

  private static _logSeverityToSeverityNumber(
    severity: LogSeverity
  ): SeverityNumber {
    switch (severity) {
      case 'info':
        return SeverityNumber.INFO;
      case 'warning':
        return SeverityNumber.WARN;
      default:
        return SeverityNumber.ERROR;
    }
  }
}
