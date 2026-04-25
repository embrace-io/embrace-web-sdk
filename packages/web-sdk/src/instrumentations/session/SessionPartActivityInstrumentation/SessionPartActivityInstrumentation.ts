import type { VisibilityStateDocument } from '../../../common/index.ts';
import type { TimeoutRef } from '../../../utils/index.ts';
import { throttle } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  ACTIVITY_EVENTS,
  ACTIVITY_THROTTLE_MS,
  PART_INACTIVITY_TIMEOUT_MS,
} from './constants.ts';
import type { SessionPartActivityInstrumentationArgs } from './types.ts';

/**
 * Drives session part lifecycle based on tab engagement. A tab is "engaged"
 * when `document.visibilityState === 'visible'` AND `document.hasFocus()`,
 * i.e., it is both on-screen and the most recently focused window. This keeps
 * exactly one tab's part active at a time, including the side-by-side or
 * multi-monitor case where two windows are both visible but only one has focus.
 *
 * **Local-debugging note**: opening DevTools (especially undocked) on some
 * browsers fires `blur` on the window; engagement drops, the part ends.
 * Closing DevTools fires `focus`; a new part starts. This produces an
 * extra short-lived part during debugging sessions. It is not a bug per
 * spec, but worth knowing when correlating local telemetry to real user
 * behavior. The same pattern applies to anything that takes window focus
 * (system dialogs, screenshot tools, OS-level overlays).
 *
 * - Ends the current part with reason `inactivity` when no keyboard, mouse,
 *   or scroll input is observed for the part-inactivity window.
 * - Ends the current part with reason `visibility_change` when engagement
 *   drops (visibility hides, window blurs, or `pagehide` fires; the last
 *   covers tab close, BFCache, and mobile-browser backgrounding where
 *   `visibilitychange` is unreliable).
 * - Starts a new part with reason `activity` when input resumes while no
 *   part is active, or with reason `visibility_change` when engagement
 *   returns (visibility, focus, or `pageshow` for BFCache restore) while
 *   no part is active.
 *
 * Registered unconditionally by `setupDefaultInstrumentations` and not guarded
 * by the `omit` set.
 */
export class SessionPartActivityInstrumentation extends EmbraceInstrumentationBase {
  private readonly _target: EventTarget;
  private readonly _visibilityDoc: VisibilityStateDocument;
  private readonly _events: ReadonlyArray<string>;
  private readonly _partInactivityTimeoutMs: number;
  private readonly _onActivityThrottled: (event: Event) => void;
  private _partInactivityTimer: TimeoutRef | null = null;
  private _unsubPartStarted: (() => void) | null = null;
  private _unsubPartEnded: (() => void) | null = null;

  public constructor({
    diag,
    perf,
    target = window,
    visibilityDoc = window.document,
    partInactivityTimeoutMs = PART_INACTIVITY_TIMEOUT_MS,
    throttleMs = ACTIVITY_THROTTLE_MS,
    events = ACTIVITY_EVENTS,
  }: SessionPartActivityInstrumentationArgs = {}) {
    super({
      instrumentationName: 'SessionPartActivityInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });
    this._target = target;
    this._visibilityDoc = visibilityDoc;
    this._events = events;
    this._partInactivityTimeoutMs = partInactivityTimeoutMs;
    this._onActivityThrottled = throttle(this._onActivity, throttleMs);
    if (this._config.enabled) {
      this.enable();
    }
  }

  public enable(): void {
    if (this._unsubPartStarted !== null) {
      return;
    }
    this._unsubPartStarted =
      this.sessionPartManager.addSessionPartStartedListener(
        this._onPartStarted,
      );
    this._unsubPartEnded = this.sessionPartManager.addSessionPartEndedListener(
      this._onPartEnded,
    );
    for (const event of this._events) {
      this._target.addEventListener(event, this._onActivityThrottled);
    }
    this._target.addEventListener('visibilitychange', this._onEngagementChange);
    this._target.addEventListener('focus', this._onEngagementChange);
    this._target.addEventListener('blur', this._onEngagementChange);
    // BFCache restore: `pageshow` (persisted=true) is the canonical signal.
    // Browsers also fire visibilitychange/focus on restore, but routing
    // pageshow through the same engagement handler makes the recovery path
    // explicit and robust to browsers that suppress one of the others.
    this._target.addEventListener('pageshow', this._onEngagementChange);
    this._target.addEventListener('pagehide', this._onPageHide);
    if (this.sessionPartManager.getSessionPartId() !== null) {
      this._armPartInactivityTimer();
    }
  }

  public disable(): void {
    this._unsubPartStarted?.();
    this._unsubPartStarted = null;
    this._unsubPartEnded?.();
    this._unsubPartEnded = null;
    for (const event of this._events) {
      this._target.removeEventListener(event, this._onActivityThrottled);
    }
    this._target.removeEventListener(
      'visibilitychange',
      this._onEngagementChange,
    );
    this._target.removeEventListener('focus', this._onEngagementChange);
    this._target.removeEventListener('blur', this._onEngagementChange);
    this._target.removeEventListener('pageshow', this._onEngagementChange);
    this._target.removeEventListener('pagehide', this._onPageHide);
    this._clearPartInactivityTimer();
  }

  private readonly _onPartStarted = (): void => {
    this._armPartInactivityTimer();
  };

  private readonly _onPartEnded = (): void => {
    this._clearPartInactivityTimer();
  };

  private readonly _onActivity = (): void => {
    try {
      if (!this._isEngaged()) {
        // Hovering / scrolling / typing over an unfocused (but visible)
        // window must not revive or extend its part: only the focused tab
        // counts as the active part.
        return;
      }
      this._diag.debug('activity detected');
      if (this.sessionPartManager.getSessionPartId() === null) {
        // Previous part was killed (part-inactivity, visibility hidden,
        // rollover) or none existed yet. Start a fresh part; the part-started
        // listener will arm the part-inactivity timer.
        this.sessionPartManager.startSessionPart('activity');
        return;
      }
      this._armPartInactivityTimer();
    } catch (e) {
      this._diag.warn('Error handling activity event', e);
    }
  };

  private readonly _onPageHide = (): void => {
    try {
      if (this.sessionPartManager.getSessionPartId() === null) {
        return;
      }
      this._diag.debug('pagehide; ending current part');
      this.sessionPartManager.endSessionPartInternal('visibility_change');
    } catch (e) {
      this._diag.warn('Error handling pagehide', e);
    }
  };

  private _isEngaged(): boolean {
    return (
      this._visibilityDoc.visibilityState === 'visible' &&
      this._visibilityDoc.hasFocus()
    );
  }

  private readonly _onEngagementChange = (): void => {
    try {
      const engaged = this._isEngaged();
      const active = this.sessionPartManager.getSessionPartId() !== null;
      if (!engaged && active) {
        this._diag.debug('tab disengaged; ending current part');
        this.sessionPartManager.endSessionPartInternal('visibility_change');
        return;
      }
      if (engaged && !active) {
        this._diag.debug('tab engaged; starting new part');
        this.sessionPartManager.startSessionPart('visibility_change');
        return;
      }
      if (engaged && active) {
        this._armPartInactivityTimer();
      }
    } catch (e) {
      this._diag.warn('Error handling engagement change', e);
    }
  };

  private _armPartInactivityTimer(): void {
    this._clearPartInactivityTimer();
    this._partInactivityTimer = setTimeout(
      this._onPartInactivity,
      this._partInactivityTimeoutMs,
    );
  }

  private _clearPartInactivityTimer(): void {
    if (this._partInactivityTimer !== null) {
      clearTimeout(this._partInactivityTimer);
      this._partInactivityTimer = null;
    }
  }

  private readonly _onPartInactivity = (): void => {
    this._partInactivityTimer = null;
    try {
      if (this.sessionPartManager.getSessionPartId() === null) {
        return;
      }
      this._diag.debug('part inactivity timer fired; ending current part');
      this.sessionPartManager.endSessionPartInternal('inactivity');
    } catch (e) {
      this._diag.warn('Error handling part inactivity timer', e);
    }
  };
}
