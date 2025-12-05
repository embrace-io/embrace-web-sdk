import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { GlobalExceptionInstrumentationArgs } from './types.ts';

export class GlobalExceptionInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onErrorHandler: (event: ErrorEvent) => void;
  private readonly _onUnhandledRejectionHandler: (
    event: PromiseRejectionEvent,
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
      this.logManager.logException(event.error || event.message, {
        handled: false,
        timestamp: this.perf.epochMillisFromOriginOffset(event.timeStamp),
        handler: 'global_exception',
      });
    };
    this._onUnhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      this.logManager.logException(event.reason, {
        handled: false,
        timestamp: this.perf.epochMillisFromOriginOffset(event.timeStamp),
        handler: 'promise_rejection',
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
      this._onUnhandledRejectionHandler,
    );
  }

  public enable(): void {
    window.addEventListener('error', this._onErrorHandler);
    window.addEventListener(
      'unhandledrejection',
      this._onUnhandledRejectionHandler,
    );
  }
}
