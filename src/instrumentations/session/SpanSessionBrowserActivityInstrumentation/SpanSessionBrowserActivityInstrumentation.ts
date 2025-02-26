import { SpanSessionInstrumentation } from '../SpanSessionInstrumentation/index.js';
import {
  EVENT_THROTTLING_TIME_WINDOW,
  TIMEOUT_TIME,
  WINDOW_USER_EVENTS,
} from './constants.js';
import {
  bulkAddEventListener,
  bulkRemoveEventListener,
  TimeoutRef,
  throttle,
} from '../../../utils/index.js';

/**
 *  SpanSessionBrowserActivityInstrumentation will track the user activity and end the session span if there is no
 *  activity for a certain amount of time.
 *  SpanSessionBrowserActivityInstrumentation will initialize new sessions if new activity is detected and there is no
 *  active session.
 * */
export class SpanSessionBrowserActivityInstrumentation extends SpanSessionInstrumentation {
  private _activityTimeout: TimeoutRef | null;
  onActivity: () => void;

  constructor() {
    super('SpanSessionBrowserActivityInstrumentation', '1.0.0', {});
    this._activityTimeout = null;
    this.onActivity = throttle(this._onActivity, EVENT_THROTTLING_TIME_WINDOW);
    if (this._config.enabled) {
      this.enable();
    }
  }

  onInactivity = () => {
    console.log('Inactivity detected');
    if (this._activityTimeout) {
      clearTimeout(this._activityTimeout);
    }
    this._activityTimeout = null;
    this.sessionManager.endSessionSpanInternal('inactivity');
  };

  _onActivity = () => {
    console.log('Activity detected');
    if (this._activityTimeout) {
      clearTimeout(this._activityTimeout);
    }
    // if there was no active session, start one
    if (!this.sessionManager.getSessionId()) {
      this.sessionManager.startSessionSpan();
    }
    this._activityTimeout = setTimeout(this.onInactivity, TIMEOUT_TIME);
  };

  disable = () => {
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

  enable = () => {
    bulkAddEventListener({
      target: window,
      events: WINDOW_USER_EVENTS,
      callback: this.onActivity,
    });
    this.onActivity();
  };
}
