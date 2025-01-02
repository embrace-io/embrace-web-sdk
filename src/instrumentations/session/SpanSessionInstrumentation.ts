import {InstrumentationModuleDefinition} from '@opentelemetry/instrumentation';
import SpanSessionProvider from './SpanSessionProvider';
import InstrumentationBase from '../InstrumentationBase';

class SpanSessionInstrumentation extends InstrumentationBase {
  private readonly _onVisibilityChange: (event: Event) => void;
  private _spanSessionProvider: SpanSessionProvider;

  constructor(spanSessionProvider: SpanSessionProvider) {
    super('SpanSessionInstrumentation', '1.0.0', {});
    this._spanSessionProvider = spanSessionProvider;
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this._spanSessionProvider.endSessionSpan();
      } else {
        this._spanSessionProvider.startSessionSpan();
      }
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  disable(): void {
    this._spanSessionProvider.endSessionSpan();

    window.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  enable(): void {
    this._spanSessionProvider.startSessionSpan();
    window.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  // no-op
  protected init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    | void {
    return undefined;
  }
}

export default SpanSessionInstrumentation;
