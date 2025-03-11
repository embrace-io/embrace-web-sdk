import { hrTimeToMilliseconds } from '@opentelemetry/core/build/src/common/time';
import type { TimeoutRef } from '../../../utils/index.js';
import { getNowHRTime } from '../../../utils/index.js';
import { SpanSessionInstrumentation } from '../SpanSessionInstrumentation/index.js';
import { TIMEOUT_TIME } from './constants.js';

/**
 *  SpanSessionTimeoutInstrumentation will track how long has a session been active and end it after a certain amount of time. It will immediately start a new session after the previous one ends.
 * */
export class SpanSessionTimeoutInstrumentation extends SpanSessionInstrumentation {
  private _sessionTimeout: TimeoutRef | null;

  public constructor() {
    super('SpanSessionTimeoutInstrumentation', '1.0.0', {});
    this._sessionTimeout = null;
    if (this._config.enabled) {
      this.enable();
    }
  }

  public disable = () => {
    if (this._sessionTimeout) {
      clearTimeout(this._sessionTimeout);
    }
    this._sessionTimeout = null;
  };

  public enable = () => {
    this._checkTimeout();
  };

  private readonly _onTimeout = () => {
    // clear existing timeout
    if (this._sessionTimeout) {
      clearTimeout(this._sessionTimeout);
    }
    this.sessionManager.endSessionSpanInternal('timer');
    this.sessionManager.startSessionSpan();
    // set a new check in TIMEOUT_TIME for the session we just started
    this._sessionTimeout = setTimeout(this._checkTimeout, TIMEOUT_TIME);
  };

  // ReturnType<typeof setTimeout> === number

  private readonly _checkTimeout = () => {
    const currentSessionStartTime = this.sessionManager.getSessionStartTime();
    // validate that there is an active session, as it may already been finished for other reasons.
    if (currentSessionStartTime) {
      // check how much time has passed since the session started
      const currentTime = getNowHRTime();
      const timePassed =
        hrTimeToMilliseconds(currentTime) -
        hrTimeToMilliseconds(currentSessionStartTime); // timePassed is in milliseconds
      const remainingTime = TIMEOUT_TIME - timePassed;
      // if the remaining time is 0 or less, the session has already timed out.
      if (remainingTime <= 0) {
        // the session has already timed out.
        this._onTimeout();
        return;
      }
      // if there is time remaining, set a new timeout for check again after it
      if (this._sessionTimeout) {
        clearTimeout(this._sessionTimeout);
      }
      this._sessionTimeout = setTimeout(this._checkTimeout, remainingTime);
      return;
    }
    // if there is no currentSessionStartTime then there is no active session,
    //  check again in TIMEOUT_TIME in case a new one is started.
    if (this._sessionTimeout) {
      clearTimeout(this._sessionTimeout);
    }
    this._sessionTimeout = setTimeout(this._checkTimeout, TIMEOUT_TIME);
  };
}
