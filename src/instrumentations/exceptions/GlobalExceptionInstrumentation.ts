import {InstrumentationModuleDefinition} from '@opentelemetry/instrumentation';
import {InstrumentationBase} from '@opentelemetry/instrumentation/build/src/platform/browser/instrumentation';
import {SpanStatusCode} from '@opentelemetry/api';

class GlobalExceptionInstrumentation extends InstrumentationBase {
  private _onErrorHandler:
    | undefined
    | ((event: ErrorEvent | PromiseRejectionEvent) => void);

  constructor() {
    super('GlobalExceptionInstrumentation', '1.0.0', {});
  }

  enable(): void {
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
