import type {
  Attributes,
  DiagLogger,
  HrTime,
  Tracer,
  TracerProvider,
} from '@opentelemetry/api';
import { diag, trace } from '@opentelemetry/api';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import type {
  PropertyOptions,
  SessionPartEndReason,
  SessionPartManager,
  SessionPartStartReason,
} from '../../api-sessions/index.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import {
  EMB_STATES,
  EMB_TYPES,
  KEY_EMB_COLD_START,
  KEY_EMB_IS_FINAL_SESSION_PART,
  KEY_EMB_SDK_STARTUP_DURATION,
  KEY_EMB_SESSION_PART_END_REASON,
  KEY_EMB_SESSION_PART_ID,
  KEY_EMB_SESSION_PART_START_REASON,
  KEY_EMB_STATE,
  KEY_EMB_TYPE,
  KEY_EMB_USER_SESSION_TERMINATION_REASON,
  KEY_PREFIX_EMB_PROPERTIES,
} from '../../constants/index.ts';
import type { ExtendedSpan } from '../../index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import {
  generateUUID,
  getVisibilityState,
  OTelPerformanceManager,
} from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';
import { EmbraceExtendedSpan } from '../EmbraceTraceManager/EmbraceExtendedSpan.ts';
import type { UserSessionLifecycleManager } from '../EmbraceUserSessionManager/index.ts';
import type {
  EmbraceSessionPartManagerArgs,
  SessionPartEndedListener,
  SessionPartStartedListener,
} from './types.ts';

export class EmbraceSessionPartManager implements SessionPartManager {
  private _previousSessionPartId: string | null = null;
  private _activeSessionPartId: string | null = null;
  private _activeSessionPartStartTime: HrTime | null = null;
  private _sessionPartSpan: ExtendedSpan | null = null;
  private _activeSessionPartCounts: Record<string, number> | null = null;
  // True until the first part of this SDK instance has been created; flipped
  // off at end of startSessionPart. Flagged on the part span as emb.cold_start.
  private _coldStart = true;
  private _nextSessionPartCounts: Record<string, number> = {};
  private _sdkStartupDuration = 0;
  private readonly _sessionPartStartedListeners: Array<SessionPartStartedListener> =
    [];
  private readonly _sessionPartEndedListeners: Array<SessionPartEndedListener> =
    [];
  private _tracer: Tracer;
  private readonly _diag: DiagLogger;
  private readonly _perf: PerformanceManager;
  private readonly _visibilityDoc: VisibilityStateDocument;
  private readonly _storage: Storage;
  private readonly _limitManager: LimitManagerInternal;
  private readonly _userSessionManager: UserSessionLifecycleManager | null;

  public constructor({
    diag: diagParam,
    perf,
    visibilityDoc = window.document,
    storage = window.localStorage,
    limitManager,
    userSessionManager,
  }: EmbraceSessionPartManagerArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceSessionPartManager',
      });
    this._perf = perf ?? new OTelPerformanceManager();
    this._visibilityDoc = visibilityDoc;
    this._storage = storage;
    this._limitManager = limitManager;
    this._userSessionManager = userSessionManager ?? null;
    this._tracer = trace.getTracer('embrace-web-sdk-sessions');

    if (this._userSessionManager) {
      this._userSessionManager.setSessionPartCallbacks({
        endSessionPart: () => this.endSessionPartInternal('user_session_ended'),
        startSessionPart: () => this.startSessionPart('user_session_rollover'),
      });
    }
  }

  // Collects all permanent session part properties from localStorage
  private _getPermanentAttributes(): Attributes {
    const permanentAttributes = new Map();
    try {
      for (let i = 0; i < this._storage.length; i++) {
        const key = this._storage.key(i);
        if (key?.startsWith(KEY_PREFIX_EMB_PROPERTIES)) {
          const value = this._storage.getItem(key);
          if (value) {
            permanentAttributes.set(key, value);
          }
        }
      }
    } catch (error) {
      this._diag.warn('Error loading permanent session part properties', error);
    }
    return Object.fromEntries(permanentAttributes.entries()) as Attributes;
  }

  public addBreadcrumb(name: string) {
    if (!this._sessionPartSpan) {
      this._diag.debug(
        'trying to add breadcrumb, but there is no session part in progress. This is a no-op.',
      );
      return;
    }

    const limitedBreadcrumb = this._limitManager.limitBreadcrumb(name);

    if (limitedBreadcrumb === 'dropped') {
      return;
    }

    this._sessionPartSpan.addEvent(
      'emb-breadcrumb',
      {
        message: limitedBreadcrumb.name,
      },
      this._perf.getNowMillis(),
    );
  }

  public addProperty(
    propertyKey: string,
    value: string,
    options?: PropertyOptions,
  ) {
    if (!this._sessionPartSpan) {
      this._diag.debug(
        'trying to add properties, but there is no session part in progress. This is a no-op.',
      );
      return;
    }

    const limitedSessionProperty = this._limitManager.limitSessionProperty(
      propertyKey,
      value,
    );

    if (limitedSessionProperty === 'dropped') {
      return;
    }

    const attributeKey = KEY_PREFIX_EMB_PROPERTIES + limitedSessionProperty.key;
    this._sessionPartSpan.setAttribute(
      attributeKey,
      limitedSessionProperty.value,
    );

    if (options?.lifespan === 'permanent') {
      try {
        this._storage.setItem(attributeKey, value);
      } catch (error) {
        this._diag.warn('Failed to set permanent session part property', error);
      }
    }
  }

  public removeProperty(propertyKey: string) {
    if (!this._sessionPartSpan) {
      this._diag.debug(
        'trying to remove a session part property, but there is no session part in progress. This is a no-op.',
      );
      return;
    }

    // We truncate long session part property keys on addProperty so need to apply the same logic here
    const attributeKey =
      KEY_PREFIX_EMB_PROPERTIES +
      this._limitManager.truncateString('session_property_key', propertyKey);
    this._sessionPartSpan.removeAttribute(attributeKey);

    try {
      if (this._storage.getItem(attributeKey)) {
        this._storage.removeItem(attributeKey);
      }
    } catch (error) {
      this._diag.warn('Error removing permanent session part property', error);
    }
  }

  public endSessionPart() {
    this.endSessionPartInternal('manual');
  }

  public endSessionPartInternal(reason: SessionPartEndReason) {
    if (!this._sessionPartSpan) {
      this._diag.debug(
        'trying to end a session part, but there is no session part in progress. This is a no-op.',
      );
      return;
    }

    for (const listener of this._sessionPartEndedListeners) {
      try {
        listener();
      } catch (error) {
        this._diag.warn(
          'Error while executing session part ended listener',
          error,
        );
      }
    }

    const endAttrs = this._endSessionPartAttributes(reason);

    const terminationInfo =
      this._userSessionManager?.getTerminationInfo() ?? null;
    if (terminationInfo?.isFinal) {
      endAttrs[KEY_EMB_IS_FINAL_SESSION_PART] = 1;
    }
    if (terminationInfo?.reason) {
      endAttrs[KEY_EMB_USER_SESSION_TERMINATION_REASON] =
        terminationInfo.reason;
    }

    // Capture the part's end timestamp before finalizing the span so the
    // user-session inactivity deadline (spec 1.1) is computed from this
    // moment, not from after the SpanProcessor.onEnd chain completes.
    const partEndTs = this._perf.getNowMillis();
    try {
      this._sessionPartSpan.setAttributes(endAttrs);
      this._sessionPartSpan.end(partEndTs);

      // Skip the continuation write-back during user-session termination:
      // the user-session manager is about to clear its stored state in its
      // `finally` block. Writing a fresh inactivity deadline here would race
      // with that clear and produce two storage events for peer tabs (a
      // sync-with-extended-deadline immediately followed by a clear).
      // Invariant: callers that set `isFinal === true` must clear `_state`
      // and storage themselves so the continuation skip is correct; without
      // that contract the inactivity deadline for continuation would be lost.
      if (this._userSessionManager && !terminationInfo?.isFinal) {
        this._userSessionManager.onSessionPartEnd(partEndTs);
      }
    } catch (error) {
      // Permanent attributes come from localStorage and could be poisoned;
      // a downstream SpanProcessor.onEnd may also throw. Without this catch,
      // the throw would silently propagate up through callers like the
      // user-session max-duration timer or endUserSession, masking which
      // step failed.
      this._diag.warn('Error finalizing session part span', error);
    } finally {
      this._sessionPartSpan = null;
      this._activeSessionPartStartTime = null;
      this._previousSessionPartId = this._activeSessionPartId;
      this._activeSessionPartId = null;
      this._activeSessionPartCounts = null;

      // For the limit manager to add a session part ended listener it would need a reference to this
      // session part manager which would create a circular dependency
      this._limitManager.reset();
    }
  }

  private _endSessionPartAttributes(reason: SessionPartEndReason): Attributes {
    return {
      ...this._getPermanentAttributes(),
      [KEY_EMB_SESSION_PART_END_REASON]: reason,
      ...this._activeSessionPartCounts,
      ...this._limitManager.getDiagnosticCounts(),
      [KEY_EMB_SDK_STARTUP_DURATION]: this._sdkStartupDuration,
    };
  }

  public getSessionPartId(): string | null {
    return this._activeSessionPartId;
  }

  public getPreviousSessionPartId(): string | null {
    return this._previousSessionPartId;
  }

  public getSessionPartSpan(): ExtendedSpan | null {
    return this._sessionPartSpan;
  }

  public getSessionPartStartTime(): HrTime | null {
    return this._activeSessionPartStartTime;
  }

  public startSessionPart(reason: SessionPartStartReason = 'init') {
    if (this._sessionPartSpan) {
      this.endSessionPartInternal('manual');
    }

    // Parts are foreground-only by definition: a part corresponds to a
    // tab that is both visible AND the most recently focused window. If
    // either condition is false we skip the start; the next engagement
    // event (visibilitychange / focus) handled by
    // SessionPartActivityInstrumentation will start the deferred part.
    if (
      getVisibilityState(this._visibilityDoc) === EMB_STATES.Background ||
      !this._visibilityDoc.hasFocus()
    ) {
      this._diag.debug(
        `skipping session part start (reason: ${reason}) because the tab is not engaged`,
      );
      return;
    }

    const activeSessionPartId = generateUUID();
    const activeSessionPartStartTime = this._perf.getNowHRTime();
    const previouslyRecordedCounts = this._nextSessionPartCounts;

    const attributes: Attributes = {
      ...this._getPermanentAttributes(),
      [KEY_EMB_TYPE]: EMB_TYPES.SessionPart,
      [KEY_EMB_STATE]: EMB_STATES.Foreground,
      [KEY_EMB_SESSION_PART_ID]: activeSessionPartId,
      [KEY_EMB_SESSION_PART_START_REASON]: reason,
      [KEY_EMB_COLD_START]: this._coldStart,
      ...previouslyRecordedCounts,
    };

    const span = new EmbraceExtendedSpan(
      this._tracer.startSpan('emb-session', {
        attributes,
      }),
    );

    // Commit state only after the span is successfully created so a startSpan
    // throw cannot leave this manager with a non-null id and a null span, and
    // so the user-session manager is not advanced for a part that failed to
    // materialize.
    this._activeSessionPartId = activeSessionPartId;
    this._activeSessionPartStartTime = activeSessionPartStartTime;
    this._activeSessionPartCounts = {};
    this._nextSessionPartCounts = {};
    this._sessionPartSpan = span;
    this._coldStart = false;

    if (this._userSessionManager) {
      // session.id is intentionally stripped: UserSessionSpanProcessor applies
      // it at onEnd so setSessionId() calls made during the part are reflected
      // in the exported span's session.id.
      const { [ATTR_SESSION_ID]: _sessionId, ...rest } =
        this._userSessionManager.onSessionPartStart();
      span.setAttributes(rest);
    }

    for (const listener of this._sessionPartStartedListeners) {
      try {
        listener();
      } catch (error) {
        this._diag.warn(
          'Error while executing session part started listener',
          error,
        );
      }
    }
  }

  public incrSessionPartCountForKey(key: string) {
    if (!this._sessionPartSpan || !this._activeSessionPartCounts) {
      this._diag.debug(
        'trying to increment a count for the active session part, but there is no session part in progress. This is a no-op.',
      );
      return;
    }

    this._activeSessionPartCounts[key] =
      (this._activeSessionPartCounts[key] || 0) + 1;
  }

  public incrNextSessionPartCountForKey(key: string) {
    this._nextSessionPartCounts[key] =
      (this._nextSessionPartCounts[key] || 0) + 1;
  }

  public addSessionPartStartedListener(listener: SessionPartStartedListener) {
    this._sessionPartStartedListeners.push(listener);

    return () => {
      const i = this._sessionPartStartedListeners.indexOf(listener);
      if (i !== -1) {
        this._sessionPartStartedListeners.splice(i, 1);
      }
    };
  }

  public addSessionPartEndedListener(listener: SessionPartEndedListener) {
    this._sessionPartEndedListeners.push(listener);

    return () => {
      const i = this._sessionPartEndedListeners.indexOf(listener);
      if (i !== -1) {
        this._sessionPartEndedListeners.splice(i, 1);
      }
    };
  }

  public recordSDKStartupDuration(duration: number) {
    this._sdkStartupDuration = Math.ceil(duration);
  }

  public setTracerProvider(tracerProvider: TracerProvider) {
    this._tracer = tracerProvider.getTracer('embrace-web-sdk-sessions');
  }
}
