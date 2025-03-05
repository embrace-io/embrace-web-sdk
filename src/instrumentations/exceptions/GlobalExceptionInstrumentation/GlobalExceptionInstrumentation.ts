import { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import { logMessage } from '../../../utils/log.js';
import { epochMillisFromOriginOffset } from '../../../utils/getNowHRTime/getNowHRTime.js';

export class GlobalExceptionInstrumentation extends InstrumentationBase {
  private readonly _onErrorHandler: (event: ErrorEvent) => void;
  private readonly _onUnhandledRejectionHandler: (
    event: PromiseRejectionEvent
  ) => void;

  constructor() {
    super('GlobalExceptionInstrumentation', '1.0.0', {});

    this._onErrorHandler = (event: ErrorEvent) => {
      logMessage(
        this.logger,
        event.error.message,
        'error',
        epochMillisFromOriginOffset(event.timeStamp),
        {},
        event.error.stack
      );
    };
    this._onUnhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      const error =
        event.reason && event.reason instanceof Error
          ? event.reason
          : new Error(
              typeof event.reason === 'string'
                ? event.reason
                : 'Unhandled Rejected Promise'
            );
      logMessage(
        this.logger,
        error.message,
        'error',
        epochMillisFromOriginOffset(event.timeStamp)
      );
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  enable(): void {
    window.addEventListener('error', this._onErrorHandler);
    window.addEventListener(
      'unhandledrejection',
      this._onUnhandledRejectionHandler
    );
  }

  disable(): void {
    if (this._onErrorHandler) {
      window.removeEventListener('error', this._onErrorHandler);
      window.removeEventListener(
        'unhandledrejection',
        this._onUnhandledRejectionHandler
      );
    }
  }

  // no-op
  protected init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    | void {
    return;
  }
}
