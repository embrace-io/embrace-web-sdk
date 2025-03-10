import type { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import { logMessage } from '../../../utils/log.js';
import { epochMillisFromOriginOffset } from '../../../utils/getNowHRTime/getNowHRTime.js';

export class GlobalExceptionInstrumentation extends InstrumentationBase {
  private readonly _onErrorHandler: (event: ErrorEvent) => void;
  private readonly _onUnhandledRejectionHandler: (
    event: PromiseRejectionEvent
  ) => void;

  public constructor() {
    super('GlobalExceptionInstrumentation', '1.0.0', {});

    this._onErrorHandler = (event: ErrorEvent) => {
      logMessage(
        this.logger,
        // ErrorEvent is not typed correctly in the DOM types
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access
        event.error.message ?? '',
        'error',
        epochMillisFromOriginOffset(event.timeStamp),
        {},
        // ErrorEvent is not typed correctly in the DOM types
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access
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

  public enable(): void {
    window.addEventListener('error', this._onErrorHandler);
    window.addEventListener(
      'unhandledrejection',
      this._onUnhandledRejectionHandler
    );
  }

  public disable(): void {
    window.removeEventListener('error', this._onErrorHandler);
    window.removeEventListener(
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
