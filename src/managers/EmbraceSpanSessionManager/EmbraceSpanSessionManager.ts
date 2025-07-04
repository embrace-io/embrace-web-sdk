import { diag, trace } from '@opentelemetry/api';
import type { Attributes, DiagLogger, HrTime } from '@opentelemetry/api';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import type {
  ReasonSessionEnded,
  PropertyOptions,
} from '../../api-sessions/index.js';
import {
  EMB_STATES,
  EMB_TYPES,
  KEY_EMB_COLD_START,
  KEY_EMB_SESSION_NUMBER,
  KEY_EMB_SESSION_REASON_ENDED,
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
import { EmbraceExtendedSpan } from '../index.js';
import type { ExtendedSpan } from '../../index.js';
import { EMBRACE_SESSION_NUMBER_STORAGE_KEY } from './constants.js';

export class EmbraceSpanSessionManager implements SpanSessionManagerInternal {
  private _activeSessionId: string | null = null;
  private _activeSessionStartTime: HrTime | null = null;
  private _sessionSpan: ExtendedSpan | null = null;
  private _activeSessionCounts: Record<string, number> | null = null;
  private _coldStart: boolean = true; // Whether the session was started from a new page load or not.
  private readonly _sessionStartedListeners: Array<SessionStartedListener> = [];
  private readonly _sessionEndedListeners: Array<SessionEndedListener> = [];

  private readonly _diag: DiagLogger;
  private readonly _perf: PerformanceManager;
  private readonly _visibilityDoc: VisibilityStateDocument;
  private readonly _storage: Storage;

  public constructor({
    diag: diagParam,
    perf,
    visibilityDoc = window.document,
    storage = window.localStorage,
  }: EmbraceSpanSessionManagerArgs = {}) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceSpanSessionManager',
      });
    this._perf = perf ?? new OTelPerformanceManager();
    this._visibilityDoc = visibilityDoc;
    this._storage = storage;
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
    const value = this._storage.getItem(EMBRACE_SESSION_NUMBER_STORAGE_KEY);
    let number = value ? parseInt(value, 10) : 0;
    number++;
    this._storage.setItem(
      EMBRACE_SESSION_NUMBER_STORAGE_KEY,
      number.toString()
    );
    return number;
  }

  public addBreadcrumb(name: string) {
    if (!this._sessionSpan) {
      this._diag.debug(
        'trying to add breadcrumb to a session, but there is no session in progress. This is a no-op.'
      );
      return;
    }

    this._sessionSpan.addEvent(
      'emb-breadcrumb',
      {
        message: name,
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

    const attributeKey = KEY_PREFIX_EMB_PROPERTIES + propertyKey;
    this._sessionSpan.setAttribute(attributeKey, value);

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

    const attributeKey = KEY_PREFIX_EMB_PROPERTIES + propertyKey;
    this._sessionSpan.removeAttribute(attributeKey);

    try {
      if (this._storage.getItem(attributeKey)) {
        this._storage.removeItem(attributeKey);
      }
    } catch (error) {
      this._diag.warn('Error removing permanent session property', error);
    }
  }

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

    this._sessionSpan.setAttributes({
      ...this._getPermanentAttributes(),
      [KEY_EMB_SESSION_REASON_ENDED]: reason,
      ...this._activeSessionCounts,
    });

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
  }

  public getSessionId(): string | null {
    return this._activeSessionId;
  }

  public getSessionSpan(): ExtendedSpan | null {
    return this._sessionSpan;
  }

  public getSessionStartTime(): HrTime | null {
    return this._activeSessionStartTime;
  }

  public startSessionSpan() {
    // if there is a session already in progress, end it first
    if (this._sessionSpan) {
      this.endSessionSpanInternal('manual');
    }

    const tracer = trace.getTracer('embrace-web-sdk-sessions');
    this._activeSessionId = generateUUID();
    this._activeSessionStartTime = this._perf.getNowHRTime();
    this._activeSessionCounts = {};
    this._sessionSpan = new EmbraceExtendedSpan(
      tracer.startSpan('emb-session', {
        attributes: {
          ...this._getPermanentAttributes(),
          [KEY_EMB_TYPE]: EMB_TYPES.Session,
          [KEY_EMB_STATE]:
            this._visibilityDoc.visibilityState === 'hidden'
              ? EMB_STATES.Background
              : EMB_STATES.Foreground,
          [ATTR_SESSION_ID]: this._activeSessionId,
          [KEY_EMB_COLD_START]: this._coldStart,
          [KEY_EMB_SESSION_NUMBER]: this._getSessionNumber(),
        },
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
}
