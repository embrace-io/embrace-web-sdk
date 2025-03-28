import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import type { SpanSessionVisibilityInstrumentationArgs } from './types.js';

export class SpanSessionVisibilityInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onVisibilityChange: (event: Event) => void;

  public constructor({ diag }: SpanSessionVisibilityInstrumentationArgs = {}) {
    super({
      instrumentationName: 'SpanSessionOnLoadInstrumentation',
      instrumentationVersion: '1.0.0',
      config: {},
      diag,
    });
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this._diag.debug('Visibility change detected: hidden');
        this.sessionManager.endSessionSpanInternal('bkgnd_state');
      } else {
        this._diag.debug('Visibility change detected: visible');
        this.sessionManager.startSessionSpan();
      }
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  public disable(): void {
    window.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  public enable(): void {
    window.addEventListener('visibilitychange', this._onVisibilityChange);
  }
}
