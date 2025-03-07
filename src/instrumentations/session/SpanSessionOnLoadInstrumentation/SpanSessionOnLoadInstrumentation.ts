import { SpanSessionInstrumentation } from '../SpanSessionInstrumentation/index.js';

export class SpanSessionOnLoadInstrumentation extends SpanSessionInstrumentation {
  public constructor() {
    super('SpanSessionOnLoadInstrumentation', '1.0.0', {});
    if (this._config.enabled) {
      this.enable();
    }
  }

  public disable(): void {
    this.sessionManager.endSessionSpanInternal('unknown');
  }

  public enable(): void {
    this.sessionManager.startSessionSpan();
  }
}
