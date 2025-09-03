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
  ReasonSessionEnded,
  StartSessionOptions,
} from '../../api-sessions/index.js';
import {
  EMB_STATES,
  EMB_TYPES,
  KEY_EMB_COLD_START,
  KEY_EMB_FROM_STORAGE,
  KEY_EMB_SDK_STARTUP_DURATION,
  KEY_EMB_SESSION_NUMBER,
  KEY_EMB_SESSION_REASON_ENDED,
  KEY_EMB_SESSION_REASON_STARTED,
  KEY_EMB_STATE,
  KEY_EMB_TYPE,
  KEY_PREFIX_EMB_PROPERTIES,
} from '../../constants/index.js';
import type { PerformanceManager } from '../../utils/index.js';
import { generateUUID, OTelPerformanceManager } from '../../utils/index.js';
import type {
  EmbraceSpanSessionManagerArgs,
  SessionEndedListener,
  SessionStartedListener,
  SpanSessionManagerInternal,
} from './types.js';
import type { VisibilityStateDocument } from '../../common/index.js';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.js';
import { EmbraceExtendedSpan } from '../index.js';
import type { ExtendedSpan } from '../../index.js';
import { EMBRACE_SESSION_NUMBER_STORAGE_KEY } from './constants.js';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-web';
import { EmbraceExperienceManager } from '../EmbraceExperienceManager/index.js';

export class EmbraceSpanSessionManager implements SpanSessionManagerInternal {
  private _activeSessionId: string | null = null;
  private _activeSessionStartTime: HrTime | null = null;
  private _sessionSpan: ExtendedSpan | null = null;
  private _activeSessionCounts: Record<string, number> | null = null;
  private _coldStart: boolean = true; // Whether the session was started from a new page load or not.
  private _sdkStartupDuration: number = 0;
  private readonly _sessionStartedListeners: Array<SessionStartedListener> = [];
  private readonly _sessionEndedListeners: Array<SessionEndedListener> = [];

  private _tracer: Tracer;
  private readonly _noExportTracer: Tracer;
  private readonly _diag: DiagLogger;
  private readonly _perf: PerformanceManager;
  private readonly _visibilityDoc: VisibilityStateDocument;
  private readonly _storage: Storage;
  private readonly _limitManager: LimitManagerInternal;
  private readonly _experienceManager: EmbraceExperienceManager;

  public constructor({
    diag: diagParam,
    perf,
    visibilityDoc = window.document,
    storage = window.localStorage,
    limitManager,
    experienceManager = new EmbraceExperienceManager({}),
  }: EmbraceSpanSessionManagerArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceSpanSessionManager',
      });
    this._perf = perf ?? new OTelPerformanceManager();
    this._visibilityDoc = visibilityDoc;
    this._storage = storage;
    this._limitManager = limitManager;
    this._experienceManager = experienceManager;
    this._tracer = trace.getTracer('embrace-web-sdk-sessions');
    this._noExportTracer = new BasicTracerProvider().getTracer(
      'embrace-web-sdk-sessions'
    );
  }

  // retrieve permanent properties from localStorage
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
      this._diag.warn('Error loading permanent session properties', error);
    }
    return Object.fromEntries(permanentAttributes.entries()) as Attributes;
  }

  // Increment and return the session number stored in local storage.
  // This is not perfect in the sense that there may be a race condition between tabs.
  // Eventually a lock could be implemented, but for now this solution should work fine.
  public _getSessionNumber(): number {
    try {
      const value = this._storage.getItem(EMBRACE_SESSION_NUMBER_STORAGE_KEY);
      let number = value ? parseInt(value, 10) : 0;
      number++;
      this._storage.setItem(
        EMBRACE_SESSION_NUMBER_STORAGE_KEY,
        number.toString()
      );
      return number;
    } catch (e) {
      this._diag.warn('Failed to retrieve session number from storage', e);
      return 1;
    }
  }

  public addBreadcrumb(name: string) {
    if (!this._sessionSpan) {
      this._diag.debug(
        'trying to add breadcrumb to a session, but there is no session in progress. This is a no-op.'
      );
      return;
    }

    const limitedBreadcrumb = this._limitManager.limitBreadcrumb(name);

    if (limitedBreadcrumb === 'dropped') {
      return;
    }

    this._sessionSpan.addEvent(
      'emb-breadcrumb',
      {
        message: limitedBreadcrumb.name,
      },
      this._perf.getNowMillis()
    );
  }

  public addProperty(
    propertyKey: string,
    value: string,
    options?: PropertyOptions
  ) {
    if (!this._sessionSpan) {
      this._diag.debug(
        'trying to add properties to a session, but there is no session in progress. This is a no-op.'
      );
      return;
    }

    const limitedSessionProperty = this._limitManager.limitSessionProperty(
      propertyKey,
      value
    );

    if (limitedSessionProperty === 'dropped') {
      return;
    }

    const attributeKey = KEY_PREFIX_EMB_PROPERTIES + limitedSessionProperty.key;
    this._sessionSpan.setAttribute(attributeKey, limitedSessionProperty.value);

    if (options?.lifespan === 'permanent') {
      try {
        this._storage.setItem(attributeKey, value);
      } catch (error) {
        this._diag.warn('Failed to set permanent session property', error);
      }
    }
  }

  public removeProperty(propertyKey: string) {
    if (!this._sessionSpan) {
      this._diag.debug(
        'trying to remove a session property, but there is no session in progress. This is a no-op.'
      );
      return;
    }

    // We truncate long session property keys on addProperty so need to apply the same logic here
    const attributeKey =
      KEY_PREFIX_EMB_PROPERTIES +
      this._limitManager.truncateString('session_property_key', propertyKey);
    this._sessionSpan.removeAttribute(attributeKey);

    try {
      if (this._storage.getItem(attributeKey)) {
        this._storage.removeItem(attributeKey);
      }
    } catch (error) {
      this._diag.warn('Error removing permanent session property', error);
    }
  }

  // the external api doesn't include a reason, and if a users uses it to end a session, the reason will be 'manual'
  // note: don't use this internally, this is just for user facing APIs. Use this.endSessionSpanInternal instead.
  public endSessionSpan() {
    this.endSessionSpanInternal('manual');
  }

  // endSessionSpanInternal is not part of the public API, but is used internally to end a session span adding a specific reason
  public endSessionSpanInternal(reason: ReasonSessionEnded) {
    if (!this._sessionSpan) {
      this._diag.debug(
        'trying to end a session, but there is no session in progress. This is a no-op.'
      );
      return;
    }

    this._sessionSpan.setAttributes(this._endSessionSpanAttributes(reason));
    this._sessionSpan.end();
    this._sessionSpan = null;
    this._activeSessionStartTime = null;
    this._activeSessionId = null;
    this._activeSessionCounts = null;

    for (const listener of this._sessionEndedListeners) {
      try {
        listener();
      } catch (error) {
        this._diag.warn('Error while executing session ended listener', error);
      }
    }

    // For the limit manager to add a session ended listener it would need a reference to this
    // session manager which would create a circular dependency
    this._limitManager.reset();
  }

  private _endSessionSpanAttributes(reason: ReasonSessionEnded): Attributes {
    return {
      ...this._getPermanentAttributes(),
      ...this._experienceManager.getExperienceAttributes(),
      [KEY_EMB_SESSION_REASON_ENDED]: reason,
      ...this._activeSessionCounts,
      ...this._limitManager.getDiagnosticCounts(),
      [KEY_EMB_SDK_STARTUP_DURATION]: this._sdkStartupDuration,
    };
  }

  // currentSessionAsReadableSpan creates a copy of the current session span with the same attributes
  // that endSessionSpanInternal would add, but does not affect the original session span which remains active.
  public currentSessionAsReadableSpan(
    reason: ReasonSessionEnded
  ): ReadableSpan | null {
    if (!this._sessionSpan || !this._activeSessionStartTime) {
      this._diag.debug(
        'trying to end a session, but there is no session in progress. This is a no-op.'
      );
      return null;
    }

    // Create a new span with the same name and start time as the original session span,
    // but using a new tracer so that it does not get exported.
    const span = this._noExportTracer.startSpan('emb-session', {
      startTime: this._activeSessionStartTime,
      attributes: {
        // Copy all current attributes from the original session span, plus the ending attributes
        ...this._sessionSpan.attributes,
        ...this._endSessionSpanAttributes(reason),
        [KEY_EMB_FROM_STORAGE]: true,
      },
    });
    span.end();
    return span as unknown as ReadableSpan;
  }

  public getSessionId(): string | null {
    return this._activeSessionId;
  }

  public getExperienceManager(): EmbraceExperienceManager {
    return this._experienceManager;
  }

  public getSessionSpan(): ExtendedSpan | null {
    return this._sessionSpan;
  }

  public getSessionStartTime(): HrTime | null {
    return this._activeSessionStartTime;
  }

  public startSessionSpan(options?: StartSessionOptions) {
    // if there is a session already in progress, end it first
    if (this._sessionSpan) {
      this.endSessionSpanInternal('manual');
    }

    this._activeSessionId = generateUUID();
    this._activeSessionStartTime = this._perf.getNowHRTime();
    this._activeSessionCounts = {};

    const attributes: Attributes = {
      ...this._getPermanentAttributes(),
      ...this._experienceManager.getExperienceAttributes(),
      [KEY_EMB_TYPE]: EMB_TYPES.Session,
      [KEY_EMB_STATE]:
        this._visibilityDoc.visibilityState === 'hidden'
          ? EMB_STATES.Background
          : EMB_STATES.Foreground,
      [ATTR_SESSION_ID]: this._activeSessionId,
      [KEY_EMB_COLD_START]: this._coldStart,
      [KEY_EMB_SESSION_NUMBER]: this._getSessionNumber(),
    };

    if (options?.reason) {
      attributes[KEY_EMB_SESSION_REASON_STARTED] = options.reason;
    }

    this._sessionSpan = new EmbraceExtendedSpan(
      this._tracer.startSpan('emb-session', {
        attributes,
      })
    );

    this._coldStart = false;

    for (const listener of this._sessionStartedListeners) {
      try {
        listener();
      } catch (error) {
        this._diag.warn(
          'Error while executing session started listener',
          error
        );
      }
    }
  }

  public incrSessionCountForKey(key: string) {
    if (!this._sessionSpan || !this._activeSessionCounts) {
      this._diag.debug(
        'trying to increment a count for the active session, but there is no session in progress. This is a no-op.'
      );
      return;
    }

    this._activeSessionCounts[key] = (this._activeSessionCounts[key] || 0) + 1;
  }

  public addSessionStartedListener(listener: SessionStartedListener) {
    const listenerIndex = this._sessionStartedListeners.push(listener);

    return () => {
      this._sessionStartedListeners.splice(listenerIndex - 1, 1);
    };
  }

  public addSessionEndedListener(listener: SessionEndedListener) {
    const listenerIndex = this._sessionEndedListeners.push(listener);

    return () => {
      this._sessionEndedListeners.splice(listenerIndex - 1, 1);
    };
  }

  public recordSDKStartupDuration(duration: number) {
    this._sdkStartupDuration = Math.ceil(duration);
  }

  public setTracerProvider(tracerProvider: TracerProvider) {
    this._tracer = tracerProvider.getTracer('embrace-web-sdk-sessions');
  }
}
