import {InstrumentationBase} from '@opentelemetry/instrumentation/build/src/platform/browser/instrumentation';
import {InstrumentationModuleDefinition} from '@opentelemetry/instrumentation';
import SpanSessionProvider from './SpanSessionProvider';

class SpanSessionInstrumentation extends InstrumentationBase {
  private _onVisibilityChange: undefined | ((event: Event) => void);
  private _spanSessionProvider: SpanSessionProvider;

  constructor(spanSessionProvider: SpanSessionProvider) {
    super('SpanSessionInstrumentation', '1.0.0', {});
    this._spanSessionProvider = spanSessionProvider;
    // When you extend the InstrumentationBase (experimental) class, super calls enable internally
    // before private fields are initialized. So we need to call this internal enable again after sessionProvider is initialized.
    this._enable();
  }

  disable(): void {
    this._spanSessionProvider.endSessionSpan();

    if (this._onVisibilityChange) {
      window.removeEventListener('visibilitychange', this._onVisibilityChange);
    }
  }

  // no-op
  // see comment in constructor
  enable(): void {}

  private _enable(): void {
    this._spanSessionProvider.startSessionSpan();
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this._spanSessionProvider.endSessionSpan();
      } else {
        this._spanSessionProvider.startSessionSpan();
      }
    };

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
