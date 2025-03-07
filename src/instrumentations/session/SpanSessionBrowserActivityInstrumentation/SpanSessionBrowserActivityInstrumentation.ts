import { SpanSessionInstrumentation } from '../SpanSessionInstrumentation/index.js';
import {
  EVENT_THROTTLING_TIME_WINDOW,
  TIMEOUT_TIME,
  WINDOW_USER_EVENTS,
} from './constants.js';
import {
  bulkAddEventListener,
  bulkRemoveEventListener,
  throttle,
  TimeoutRef,
} from '../../../utils/index.js';

/**
 *  SpanSessionBrowserActivityInstrumentation will track the user activity and end the session span if there is no
 *  activity for a certain amount of time.
 *  SpanSessionBrowserActivityInstrumentation will initialize new sessions if new activity is detected and there is no
 *  active session.
 * */
export class SpanSessionBrowserActivityInstrumentation extends SpanSessionInstrumentation {
  private readonly onActivity: () => void;
  private _activityTimeout: TimeoutRef | null;

  public constructor() {
    super('SpanSessionBrowserActivityInstrumentation', '1.0.0', {});
    this._activityTimeout = null;
    this.onActivity = throttle(this._onActivity, EVENT_THROTTLING_TIME_WINDOW);
    if (this._config.enabled) {
      this.enable();
    }
  }

  public disable = () => {
    bulkRemoveEventListener({
      target: window,
      events: WINDOW_USER_EVENTS,
      callback: this.onActivity,
    });
    if (this._activityTimeout) {
      clearTimeout(this._activityTimeout);
    }
    this._activityTimeout = null;
  };

  public enable = () => {
    bulkAddEventListener({
      target: window,
      events: WINDOW_USER_EVENTS,
      callback: this.onActivity,
    });
    this.onActivity();
  };

  private readonly onInactivity = () => {
    this._diag.debug('Inactivity detected');
    if (this._activityTimeout) {
      clearTimeout(this._activityTimeout);
    }
    this._activityTimeout = null;
    this.sessionManager.endSessionSpanInternal('inactivity');
  };

  private readonly _onActivity = () => {
    this._diag.debug('Activity detected');
    if (this._activityTimeout) {
      clearTimeout(this._activityTimeout);
    }
    // if there was no active session, start one
    if (!this.sessionManager.getSessionId()) {
      this.sessionManager.startSessionSpan();
    }
    this._activityTimeout = setTimeout(this.onInactivity, TIMEOUT_TIME);
  };
}
