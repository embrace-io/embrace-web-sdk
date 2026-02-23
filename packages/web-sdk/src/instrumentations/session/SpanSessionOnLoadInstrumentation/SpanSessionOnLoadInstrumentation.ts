import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { SpanSessionOnLoadInstrumentationArgs } from './types.ts';

export class SpanSessionOnLoadInstrumentation extends EmbraceInstrumentationBase {
  public constructor({ diag }: SpanSessionOnLoadInstrumentationArgs = {}) {
    super({
      instrumentationName: 'SpanSessionOnLoadInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      config: {},
    });
    if (this._config.enabled) {
      this.enable();
    }
  }

  public disable(): void {
    this.sessionManager.endSessionSpanInternal('unknown');
  }

  public enable(): void {
    this.sessionManager.startSessionSpan({ reason: 'init' });
  }
}
