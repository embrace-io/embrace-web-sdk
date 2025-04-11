import { hrTimeToMilliseconds } from '@opentelemetry/core';
import { type TimeoutRef } from '../../../utils/index.js';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import { TIMEOUT_TIME } from './constants.js';
import type { SpanSessionTimeoutInstrumentationArgs } from './types.js';

/**
 *  SpanSessionTimeoutInstrumentation will track how long has a session been active and end it after a certain amount of time.
 *  It will immediately start a new session after the previous one ends.
 **/
export class SpanSessionTimeoutInstrumentation extends EmbraceInstrumentationBase {
  private _sessionTimeout: TimeoutRef | null;

  public constructor({
    diag,
    perf,
  }: SpanSessionTimeoutInstrumentationArgs = {}) {
    super({
      instrumentationName: 'SpanSessionTimeoutInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });
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
    this._diag.debug('Timeout detected');
    // clear existing timeout
    if (this._sessionTimeout) {
      clearTimeout(this._sessionTimeout);
    }
    this.sessionManager.endSessionSpanInternal('timer');
    this.sessionManager.startSessionSpan();
    // set a new check in TIMEOUT_TIME for the session we just started
    this._sessionTimeout = setTimeout(this._checkTimeout, TIMEOUT_TIME);
  };

  private readonly _checkTimeout = () => {
    const currentSessionStartTime = this.sessionManager.getSessionStartTime();
    // validate that there is an active session, as it may already been finished for other reasons.
    if (currentSessionStartTime) {
      // check how much time has passed since the session started
      const currentTime = this.perf.getNowHRTime();
      const currentTimeMillis = hrTimeToMilliseconds(currentTime);
      const currentSessionStartTimeMillis = hrTimeToMilliseconds(
        currentSessionStartTime
      );
      const timePassed = currentTimeMillis - currentSessionStartTimeMillis;
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
