import { SpanSessionInstrumentation } from '../SpanSessionInstrumentation/index.js';

export class SpanSessionOnLoadInstrumentation extends SpanSessionInstrumentation {
  constructor() {
    super('SpanSessionOnLoadInstrumentation', '1.0.0', {});
    if (this._config.enabled) {
      this.enable();
    }
  }

  disable(): void {
    this.sessionManager.endSessionSpan();
  }

  enable(): void {
    this.sessionManager.startSessionSpan();
  }
}
