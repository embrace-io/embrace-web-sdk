import {InstrumentationModuleDefinition} from '@opentelemetry/instrumentation';
import {SpanStatusCode} from '@opentelemetry/api';
import InstrumentationBase from '../InstrumentationBase';

class GlobalExceptionInstrumentation extends InstrumentationBase {
  private readonly _onErrorHandler: (
    event: ErrorEvent | PromiseRejectionEvent,
  ) => void;

  constructor() {
    super('GlobalExceptionInstrumentation', '1.0.0', {});

    this._onErrorHandler = (event: ErrorEvent | PromiseRejectionEvent) => {
      const error: Error | undefined =
        'reason' in event ? event.reason : event.error;
      const message = error?.message;

      const errorSpan = this.tracer.startSpan('on-error');
      errorSpan.setStatus({
        message,
        code: SpanStatusCode.ERROR,
      });

      if (error) {
        errorSpan.recordException(error);
      } else {
        errorSpan.recordException({
          name: 'Unknown Exception',
          message,
        });
      }

      errorSpan.end();
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  enable(): void {
    window.addEventListener('error', this._onErrorHandler);
    window.addEventListener('unhandledrejection', this._onErrorHandler);
  }

  disable(): void {
    if (this._onErrorHandler) {
      window.removeEventListener('error', this._onErrorHandler);
      window.removeEventListener('unhandledrejection', this._onErrorHandler);
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
