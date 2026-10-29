import type { TimeInput } from '@opentelemetry/api';
import type { Logger, LoggerOptions, LogRecord } from '@opentelemetry/api-logs';
import { LoggerProvider } from '@opentelemetry/sdk-logs';
import type { PerformanceManager } from '../../utils/index.ts';
import type { EmbraceLoggerProviderArgs } from './types.ts';

/**
 * A LoggerProvider whose loggers stamp logs on the SDK clock. A log without a timestamp gets
 * `getNow()`, and a performance.now()-based timestamp is converted with `offsetToAbsoluteTime()`.
 * OTel would use Date.now() and timeOrigin + value, which can disagree with the SDK clock by up to
 * the drift threshold and by any time the machine slept, respectively.
 */
export class EmbraceLoggerProvider extends LoggerProvider {
  private readonly _perf: PerformanceManager;

  public constructor({ perf, ...config }: EmbraceLoggerProviderArgs) {
    super(config);
    this._perf = perf;
  }

  public override getLogger(
    name: string,
    version?: string,
    options?: LoggerOptions,
  ): Logger {
    return new EmbraceLogger(
      super.getLogger(name, version, options),
      this._perf,
    );
  }
}

class EmbraceLogger implements Logger {
  private readonly _logger: Logger;
  private readonly _perf: PerformanceManager;

  public constructor(logger: Logger, perf: PerformanceManager) {
    this._logger = logger;
    this._perf = perf;
  }

  public emit(logRecord: LogRecord): void {
    this._logger.emit({
      ...logRecord,
      timestamp: this._toAbsoluteTime(logRecord.timestamp),
    });
  }

  public enabled(options?: Parameters<Logger['enabled']>[0]): boolean {
    return this._logger.enabled(options);
  }

  private _toAbsoluteTime(timestamp: TimeInput | undefined): TimeInput {
    if (timestamp === undefined) {
      return this._perf.getNow();
    }
    // TODO: review once https://github.com/open-telemetry/opentelemetry-js/issues/7217 is closed
    // OTel's own cut-off between a performance.now()-based value and epoch milliseconds
    if (
      typeof timestamp === 'number' &&
      timestamp < performance.timeOrigin / 2
    ) {
      return this._perf.offsetToAbsoluteTime(timestamp);
    }
    return timestamp;
  }
}
