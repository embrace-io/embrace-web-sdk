import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import type { SpanSessionVisibilityInstrumentationArgs } from './types.js';
import type { TimeoutRef } from '../../../utils/index.js';
import {
  bulkAddEventListener,
  bulkRemoveEventListener,
  throttle,
} from '../../../utils/index.js';
import type { EmbraceProcessor } from '../../../processors/index.js';

const SESSION_INTERACTION_EVENTS = ['mousedown'];
const MAX_PENDING_SPAN_COUNT = 5;

export class SpanSessionVisibilityInstrumentation extends EmbraceInstrumentationBase {
  private _currentVisibilityState: DocumentVisibilityState;
  private _checkVisibilityTimeout: TimeoutRef | null;
  private _interactionSinceLastVisibilityChange: boolean;
  private readonly _avoidEndingLimitedSessions: boolean;
  private readonly _embraceSpanProcessor?: EmbraceProcessor;
  private readonly _checkVisibilityChange: () => void;
  private readonly _onVisibilityChange: () => void;
  private readonly _onInteractionThrottled: () => void;

  public constructor(
    {
      diag,
      perf,
      visibilityWaitTimeMs = 0,
      limitedSessionMaxDurationMs = 0,
      backgroundSessions = false,
      visibilityDoc = window.document,
    }: SpanSessionVisibilityInstrumentationArgs = {},
    embraceSpanProcessor?: EmbraceProcessor
  ) {
    super({
      instrumentationName: 'SpanSessionVisibilityInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._currentVisibilityState = visibilityDoc.visibilityState;
    this._checkVisibilityTimeout = null;
    this._interactionSinceLastVisibilityChange = false;
    this._avoidEndingLimitedSessions = limitedSessionMaxDurationMs > 0;
    this._embraceSpanProcessor = embraceSpanProcessor;

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
        this._currentVisibilityState != visibilityDoc.visibilityState
      ) {
        this._currentVisibilityState = visibilityDoc.visibilityState;
        this._onVisibilityChange();
        return;
      }

      this._diag.debug(
        `Visibility changed to ${visibilityDoc.visibilityState}. Will wait ${(visibilityWaitTimeMs / 1000).toString()}s, and check if visibility changed`
      );
      this._checkVisibilityTimeout = setTimeout(() => {
        if (this._currentVisibilityState != visibilityDoc.visibilityState) {
          this._currentVisibilityState = visibilityDoc.visibilityState;
          this._onVisibilityChange();
        } else {
          this._diag.debug(
            `Visibility was not changed after timeout happened: ${visibilityDoc.visibilityState}`
          );
        }
      }, visibilityWaitTimeMs);
    };

    this._onVisibilityChange = () => {
      this._diag.debug(
        `Visibility change detected: ${visibilityDoc.visibilityState}`
      );

      const currentSessionStartTime = this.sessionManager.getSessionStartTime();

      // A limited session is one that is:
      // - shorter than a specified duration threshold
      // - contains no user interactions
      // - Embrace is enabled and the amount of pending spans is less than MAX_PENDING_SPAN_COUNT
      const isLimitedSession =
        this._avoidEndingLimitedSessions &&
        currentSessionStartTime !== null &&
        this.perf.millisSinceHRTime(currentSessionStartTime) <
          limitedSessionMaxDurationMs &&
        !this._interactionSinceLastVisibilityChange &&
        !!this._embraceSpanProcessor &&
        this._embraceSpanProcessor.getPendingSpansCount() <
          MAX_PENDING_SPAN_COUNT;

      if (isLimitedSession) {
        this._diag.debug(
          'Not ending the session since it is considered limited'
        );
        // If this session still meets the definition of a limited session don't yet end it but instead just record
        // the visibility change as a breadcrumb
        this.sessionManager.addBreadcrumb(
          `Tab visibility changed to ${visibilityDoc.visibilityState}`
        );

        const sessionId = this.sessionManager.getSessionId();
        if (sessionId) {
          const sessionSpan =
            this.sessionManager.currentSessionAsReadableSpan('state_changed');
          if (sessionSpan) {
            this._embraceSpanProcessor.storePendingSpans(
              sessionId,
              sessionSpan
            );
          }
        }
      } else {
        // If there was a session in progress that we didn't end because we considered it limited, then drop the stored spans in storage:
        const sessionId = this.sessionManager.getSessionId();
        if (this._embraceSpanProcessor && sessionId) {
          this._embraceSpanProcessor.clearStoredSpans(sessionId);
        }

        this.sessionManager.endSessionSpanInternal('state_changed');

        if (visibilityDoc.visibilityState === 'hidden' && backgroundSessions) {
          this._diag.debug(
            'Starting a session since document visibility switched to hidden and `backgroundSessions` is enabled'
          );
          this.sessionManager.startSessionSpan({ reason: 'hidden' });
        } else if (visibilityDoc.visibilityState === 'visible') {
          this._diag.debug(
            'Starting a session since document visibility switched to visible'
          );
          this.sessionManager.startSessionSpan({ reason: 'visible' });
        }
      }

      this._interactionSinceLastVisibilityChange = false;
    };

    this._onInteractionThrottled = throttle(() => {
      this._interactionSinceLastVisibilityChange = true;
    }, 1000);

    if (this._config.enabled) {
      this.enable();
    }
  }

  public disable(): void {
    window.removeEventListener('visibilitychange', this._checkVisibilityChange);

    if (this._avoidEndingLimitedSessions) {
      bulkRemoveEventListener({
        target: window,
        events: SESSION_INTERACTION_EVENTS,
        callback: this._onInteractionThrottled,
      });
    }
  }

  public enable(): void {
    window.addEventListener('visibilitychange', this._checkVisibilityChange);

    if (this._avoidEndingLimitedSessions) {
      bulkAddEventListener({
        target: window,
        events: SESSION_INTERACTION_EVENTS,
        callback: this._onInteractionThrottled,
      });
    }
  }
}
