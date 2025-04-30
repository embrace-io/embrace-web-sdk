import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import type { SpanSessionVisibilityInstrumentationArgs } from './types.js';

export class SpanSessionVisibilityInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onVisibilityChange: (event: Event) => void;

  public constructor({
    diag,
    backgroundSessions = false,
    visibilityDoc = window.document,
  }: SpanSessionVisibilityInstrumentationArgs = {}) {
    super({
      instrumentationName: 'SpanSessionOnLoadInstrumentation',
      instrumentationVersion: '1.0.0',
      config: {},
      diag,
    });
    this._onVisibilityChange = () => {
      this._diag.debug(
        `Visibility change detected: ${visibilityDoc.visibilityState}`
      );
      this.sessionManager.endSessionSpanInternal('state_changed');

      if (visibilityDoc.visibilityState === 'hidden' && backgroundSessions) {
        this._diag.debug(
          'Starting a session since document visibility switched to hidden and `backgroundSessions` is enabled'
        );
        this.sessionManager.startSessionSpan();
      } else if (visibilityDoc.visibilityState === 'visible') {
        this._diag.debug(
          'Starting a session since document visibility switched to visible'
        );
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
