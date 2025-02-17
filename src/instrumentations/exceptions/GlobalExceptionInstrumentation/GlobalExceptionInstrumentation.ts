import { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { SpanStatusCode } from '@opentelemetry/api';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import { GlobalExceptionInstrumentationArgs } from './types.js';

export class GlobalExceptionInstrumentation extends InstrumentationBase {
  private readonly _onErrorHandler: (event: ErrorEvent) => void;
  private readonly _onUnhandledRejectionHandler: (
    event: PromiseRejectionEvent
  ) => void;

  constructor({ spanSessionManager }: GlobalExceptionInstrumentationArgs) {
    super('GlobalExceptionInstrumentation', '1.0.0', {});

    this._onErrorHandler = (event: ErrorEvent) => {
      const error: Error = event.error;
      const currentSessionSpan = spanSessionManager.getSessionSpan();
      if (!currentSessionSpan) {
        return;
      }
      currentSessionSpan.setStatus({
        message: event.error.message,
        code: SpanStatusCode.ERROR,
      });
      currentSessionSpan.recordException(error);
    };
    this._onUnhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      const error =
        event.reason && event.reason instanceof Error
          ? event.reason
          : new Error(
              typeof event.reason === 'string'
                ? event.reason
                : 'Rejected Promise'
            );
      const message = error.message;
      const currentSessionSpan = spanSessionManager.getSessionSpan();
      if (!currentSessionSpan) {
        return;
      }
      currentSessionSpan.setStatus({
        message,
        code: SpanStatusCode.ERROR,
      });
      currentSessionSpan.recordException(error);
      currentSessionSpan.end();
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
