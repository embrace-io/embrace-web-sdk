import { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '../../InstrumentationBase';

export class SpanSessionInstrumentation extends InstrumentationBase {
  private readonly _onVisibilityChange: (event: Event) => void;

  constructor() {
    super('SpanSessionInstrumentation', '1.0.0', {});
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.sessionProvider.endSessionSpan();
      } else {
        this.sessionProvider.startSessionSpan();
      }
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  disable(): void {
    this.sessionProvider.endSessionSpan();

    window.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  enable(): void {
    this.sessionProvider.startSessionSpan();
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
