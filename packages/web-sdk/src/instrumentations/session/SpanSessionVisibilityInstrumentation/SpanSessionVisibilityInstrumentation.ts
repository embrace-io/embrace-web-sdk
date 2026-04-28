import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { SpanSessionVisibilityInstrumentationArgs } from './types.ts';

export class SpanSessionVisibilityInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onVisibilityChange: () => void;

  public constructor({
    diag,
    perf,
    visibilityDoc = window.document,
  }: SpanSessionVisibilityInstrumentationArgs = {}) {
    super({
      instrumentationName: 'SpanSessionVisibilityInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._onVisibilityChange = () => {
      this._diag.debug(
        `Visibility change detected: ${visibilityDoc.visibilityState}`,
      );

      try {
        this.sessionManager.endSessionSpanInternal('state_changed');

        if (visibilityDoc.visibilityState === 'visible') {
          this._diag.debug(
            'Starting a session since document visibility switched to visible',
          );
          this.sessionManager.startSessionSpan({ reason: 'visible' });
        }
      } catch (error) {
        this._diag.error(
          `Failed to rotate session on visibility change to ${visibilityDoc.visibilityState}`,
          error,
        );
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
