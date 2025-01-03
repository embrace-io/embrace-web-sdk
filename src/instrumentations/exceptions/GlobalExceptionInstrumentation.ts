import {InstrumentationModuleDefinition} from '@opentelemetry/instrumentation';
import {SpanStatusCode} from '@opentelemetry/api';
import InstrumentationBase from '../InstrumentationBase';

class GlobalExceptionInstrumentation extends InstrumentationBase {
  private readonly _onErrorHandler: (event: ErrorEvent) => void;
  private readonly _onUnhandledRejectionHandler: (
    event: PromiseRejectionEvent,
  ) => void;

  constructor() {
    super('GlobalExceptionInstrumentation', '1.0.0', {});

    this._onErrorHandler = (event: ErrorEvent) => {
      const error: Error = event.error;
      const errorSpan = this.tracer.startSpan('on-error');

      errorSpan.setStatus({
        message: event.error.message,
        code: SpanStatusCode.ERROR,
      });
      errorSpan.recordException(error);
      errorSpan.end();
    };
    this._onUnhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      const error =
        event.reason && event.reason instanceof Error
          ? event.reason
          : new Error(
              typeof event.reason === 'string'
                ? event.reason
                : 'Rejected Promise',
            );
      const message = error.message;
      const errorSpan = this.tracer.startSpan('on-unhandled-rejection');

      errorSpan.setStatus({
        message,
        code: SpanStatusCode.ERROR,
      });
      errorSpan.recordException(error);
      errorSpan.end();
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  enable(): void {
    window.addEventListener('error', this._onErrorHandler);
    window.addEventListener(
      'unhandledrejection',
      this._onUnhandledRejectionHandler,
    );
  }

  disable(): void {
    if (this._onErrorHandler) {
      window.removeEventListener('error', this._onErrorHandler);
      window.removeEventListener(
        'unhandledrejection',
        this._onUnhandledRejectionHandler,
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

export default GlobalExceptionInstrumentation;
