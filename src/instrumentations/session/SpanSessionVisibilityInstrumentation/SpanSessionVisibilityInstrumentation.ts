import { SpanSessionInstrumentation } from '../SpanSessionInstrumentation/index.js';

export class SpanSessionVisibilityInstrumentation extends SpanSessionInstrumentation {
  private readonly _onVisibilityChange: (event: Event) => void;

  constructor() {
    super('SpanSessionVisibilityInstrumentation', '1.0.0', {});
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.sessionManager.endSessionSpanInternal('visibility_hidden');
      } else {
        this.sessionManager.startSessionSpan();
      }
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  disable(): void {
    window.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  enable(): void {
    window.addEventListener('visibilitychange', this._onVisibilityChange);
  }
}
