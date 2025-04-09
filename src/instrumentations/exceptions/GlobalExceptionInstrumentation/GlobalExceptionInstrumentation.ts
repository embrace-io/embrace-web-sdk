import type { GlobalExceptionInstrumentationArgs } from './types.js';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';

export class GlobalExceptionInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onErrorHandler: (event: ErrorEvent) => void;
  private readonly _onUnhandledRejectionHandler: (
    event: PromiseRejectionEvent
  ) => void;

  public constructor({ diag, perf }: GlobalExceptionInstrumentationArgs = {}) {
    super({
      instrumentationName: 'GlobalExceptionInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });
    this._onErrorHandler = (event: ErrorEvent) => {
      this.logManager.logException(
        this.perf.epochMillisFromOriginOffset(event.timeStamp),
        event.error as Error,
        false
      );
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

      this.logManager.logException(
        this.perf.epochMillisFromOriginOffset(event.timeStamp),
        error,
        false
      );
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
}
