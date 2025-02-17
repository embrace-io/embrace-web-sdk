import { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import { session, SpanSessionManager } from '../../../api-sessions/index.js';

export class SpanSessionInstrumentation extends InstrumentationBase {
  private readonly _onVisibilityChange: (event: Event) => void;
  private readonly _sessionManager: SpanSessionManager;

  constructor() {
    super('SpanSessionInstrumentation', '1.0.0', {});
    this._sessionManager = session.getSpanSessionManager();
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.sessionManager.endSessionSpan();
      } else {
        this.sessionManager.startSessionSpan();
      }
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  /* Returns session provider */
  protected get sessionManager(): SpanSessionManager {
    return this._sessionManager;
  }

  disable(): void {
    this.sessionManager.endSessionSpan();

    window.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  enable(): void {
    this.sessionManager.startSessionSpan();
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
