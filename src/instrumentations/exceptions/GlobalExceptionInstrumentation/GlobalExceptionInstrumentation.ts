import type { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import type { PerformanceManager } from '../../../utils/index.js';
import { OTelPerformanceManager } from '../../../utils/index.js';
import { logException } from '../../../utils/log.js';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import type { GlobalExceptionInstrumentationArgs } from './types.js';

export class GlobalExceptionInstrumentation extends InstrumentationBase {
  private readonly _onErrorHandler: (event: ErrorEvent) => void;
  private readonly _perf: PerformanceManager;
  private readonly _onUnhandledRejectionHandler: (
    event: PromiseRejectionEvent
  ) => void;

  public constructor({
    perf = new OTelPerformanceManager(),
  }: GlobalExceptionInstrumentationArgs = {}) {
    super('GlobalExceptionInstrumentation', '1.0.0', {});
    this._perf = perf;
    this._onErrorHandler = (event: ErrorEvent) => {
      logException({
        logger: this.logger,
        timestamp: this._perf.epochMillisFromOriginOffset(event.timeStamp),
        error: event.error as Error,
        handled: false,
      });
    };
    this._onUnhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      let error: Error;
      if (event.reason && event.reason instanceof Error) {
        error = event.reason;
      } else {
        error = new Error(
          typeof event.reason === 'string'
            ? event.reason
            : 'Unhandled Rejected Promise'
        );
        error.stack = '';
      }

      logException({
        logger: this.logger,
        timestamp: this._perf.epochMillisFromOriginOffset(event.timeStamp),
        error,
        handled: false,
      });
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  public disable(): void {
    window.removeEventListener('error', this._onErrorHandler);
    window.removeEventListener(
      'unhandledrejection',
      this._onUnhandledRejectionHandler
    );
  }

  public enable(): void {
    window.addEventListener('error', this._onErrorHandler);
    window.addEventListener(
      'unhandledrejection',
      this._onUnhandledRejectionHandler
    );
  }

  protected override init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    // NOTE: disabling typescript check, as this class was copied from OTel repo.
    // TBH, I agree with typescript here, but keeping it disabled for consistency with the base repo
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    | void {
    return;
  }
}
