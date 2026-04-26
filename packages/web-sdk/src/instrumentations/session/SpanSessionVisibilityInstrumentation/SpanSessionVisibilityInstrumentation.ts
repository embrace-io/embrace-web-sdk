import type { TimeoutRef } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { SpanSessionVisibilityInstrumentationArgs } from './types.ts';

export class SpanSessionVisibilityInstrumentation extends EmbraceInstrumentationBase {
  private _currentVisibilityState: DocumentVisibilityState;
  private _checkVisibilityTimeout: TimeoutRef | null;
  private readonly _checkVisibilityChange: () => void;
  private readonly _onVisibilityChange: () => void;

  public constructor({
    diag,
    perf,
    visibilityWaitTimeMs = 0,
    backgroundSessions = false,
    visibilityDoc = window.document,
  }: SpanSessionVisibilityInstrumentationArgs = {}) {
    super({
      instrumentationName: 'SpanSessionVisibilityInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._currentVisibilityState = visibilityDoc.visibilityState;
    this._checkVisibilityTimeout = null;

    this._checkVisibilityChange = () => {
      if (visibilityWaitTimeMs <= 0) {
        // If no timeout configured, events are forwarded directly.
        this._currentVisibilityState = visibilityDoc.visibilityState;
        this._onVisibilityChange();
        return;
      }
      if (this._checkVisibilityTimeout) {
        clearTimeout(this._checkVisibilityTimeout);
      }

      // When switching to visible, we want to trigger the event immediately
      if (
        visibilityDoc.visibilityState === 'visible' &&
        this._currentVisibilityState !== visibilityDoc.visibilityState
      ) {
        this._currentVisibilityState = visibilityDoc.visibilityState;
        this._onVisibilityChange();
        return;
      }

      this._diag.debug(
        `Visibility changed to ${visibilityDoc.visibilityState}. Will wait ${(visibilityWaitTimeMs / 1000).toString()}s, and check if visibility changed`,
      );
      this._checkVisibilityTimeout = setTimeout(() => {
        if (this._currentVisibilityState !== visibilityDoc.visibilityState) {
          this._currentVisibilityState = visibilityDoc.visibilityState;
          this._onVisibilityChange();
        } else {
          this._diag.debug(
            `Visibility was not changed after timeout happened: ${visibilityDoc.visibilityState}`,
          );
        }
      }, visibilityWaitTimeMs);
    };

    this._onVisibilityChange = () => {
      this._diag.debug(
        `Visibility change detected: ${visibilityDoc.visibilityState}`,
      );

      try {
        this.sessionManager.endSessionSpanInternal('state_changed');

        if (visibilityDoc.visibilityState === 'hidden' && backgroundSessions) {
          this._diag.debug(
            'Starting a session since document visibility switched to hidden and `backgroundSessions` is enabled',
          );
          this.sessionManager.startSessionSpan({ reason: 'hidden' });
        } else if (visibilityDoc.visibilityState === 'visible') {
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
    window.removeEventListener('visibilitychange', this._checkVisibilityChange);
  }

  public enable(): void {
    window.addEventListener('visibilitychange', this._checkVisibilityChange);
  }
}
