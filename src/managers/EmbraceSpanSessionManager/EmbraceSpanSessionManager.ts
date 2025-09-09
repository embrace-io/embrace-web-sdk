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
  KEY_EMB_TAB_ID,
  KEY_EMB_PARENT_TAB_ID,
  KEY_EMB_EXPERIENCE_ID,
} from '../../constants/index.js';
import type { PerformanceManager } from '../../utils/index.js';
import { generateUUID, OTelPerformanceManager } from '../../utils/index.js';
import type {
  EmbraceSpanSessionManagerArgs,
  SessionEndedListener,
  SessionStartedListener,
  SpanSessionManagerInternal,
  StoredTab,
  Tab,
} from './types.js';
import type { VisibilityStateDocument } from '../../common/index.js';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.js';
import { EmbraceExtendedSpan } from '../index.js';
import type { ExtendedSpan } from '../../index.js';
import {
  EMBRACE_CURRENT_TAB_STORAGE_KEY,
  EMBRACE_SESSION_NUMBER_STORAGE_KEY,
  EMBRACE_TAB_STORAGE_KEY_PREFIX,
} from './constants.js';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-web';
import { getAppInstanceId } from '../../resources/index.js';

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
  private readonly _sessionStorage: Storage;
  private readonly _limitManager: LimitManagerInternal;

  // Cross-tab tracking
  private readonly _currentTab: Tab;

  public constructor({
    diag: diagParam,
    perf,
    visibilityDoc = window.document,
    storage = window.localStorage,
    sessionStorage = window.sessionStorage,
    limitManager,
  }: EmbraceSpanSessionManagerArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceSpanSessionManager',
      });
    this._perf = perf ?? new OTelPerformanceManager();
    this._visibilityDoc = visibilityDoc;
    this._storage = storage;
    this._sessionStorage = sessionStorage;
    this._limitManager = limitManager;
    this._tracer = trace.getTracer('embrace-web-sdk-sessions');
    this._noExportTracer = new BasicTracerProvider().getTracer(
      'embrace-web-sdk-sessions'
    );

    // Initialize cross-tab tracking
    this._currentTab = this._initTab(); // Creates or retrieves tab IDs from sessionStorage
    this._updateTab(); // Immediately store this tab in localStorage as a potential parent
    // We store on init to avoid race conditions - child tabs need to find their parent
    // before the parent's click handler has time to execute

    this._setupListeners();
  }

  // Collects all permanent session properties from localStorage
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

  // Increments and returns a global session counter shared across all tabs
  // Race conditions are possible but acceptable for session numbering
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
      [KEY_EMB_TYPE]: EMB_TYPES.Session,
      [KEY_EMB_STATE]:
        this._visibilityDoc.visibilityState === 'hidden'
          ? EMB_STATES.Background
          : EMB_STATES.Foreground,
      [ATTR_SESSION_ID]: this._activeSessionId,
      [KEY_EMB_COLD_START]: this._coldStart,
      [KEY_EMB_SESSION_NUMBER]: this._getSessionNumber(),
      [KEY_EMB_EXPERIENCE_ID]: this._currentTab.experienceId,
      [KEY_EMB_TAB_ID]: this._currentTab.tabId,
    };

    if (this._currentTab.parentTabId) {
      attributes[KEY_EMB_PARENT_TAB_ID] = this._currentTab.parentTabId;
    }

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

  private _initTab(): Tab {
    // On page reload, preserve the same tab IDs
    try {
      const stored = this._sessionStorage.getItem(
        EMBRACE_CURRENT_TAB_STORAGE_KEY
      );
      if (stored) {
        return JSON.parse(stored) as Tab;
      }
    } catch (e) {
      this._diag.warn('Failed to retrieve current tab data', e);
    }

    // New tab - look for parent that opened us
    const parentTab = this._findParentTabByReferrer();
    const currentTab: Tab = {
      experienceId: parentTab?.experienceId ?? generateUUID(), // Inherit experience or start new one
      tabId: getAppInstanceId(this._sessionStorage, this._diag), // Unique ID for this tab
      parentTabId: parentTab?.tabId, // Link to parent if found
    };

    // Persist tab data for page reloads
    try {
      this._sessionStorage.setItem(
        EMBRACE_CURRENT_TAB_STORAGE_KEY,
        JSON.stringify(currentTab)
      );
    } catch (e) {
      this._diag.warn('Failed to store current tab data', e);
    }

    return currentTab;
  }

  private _findParentTabByReferrer(
    referrer = document.referrer
  ): StoredTab | null {
    if (!referrer) {
      return null;
    }

    // Skip cross-origin referrers (can't be our parent tab)
    try {
      const referrerUrl = new URL(referrer);
      if (referrerUrl.origin !== window.location.origin) {
        return null;
      }
    } catch {
      // Invalid referrer URL
      return null;
    }

    const referrerKey = this._hashUrl(referrer);
    const urlKey = `${EMBRACE_TAB_STORAGE_KEY_PREFIX}${referrerKey}`;
    const entries = this._getTabs(urlKey);

    if (entries.length === 0) {
      return null;
    }

    // Find the parent tab that opened this tab. We use a 20-second window
    // to ensure we only match the actual parent (new tabs typically open
    // within 1-2 seconds) while allowing for slow page loads.
    const now = Date.now();
    return (
      entries
        .filter(entry => now - entry.timestamp <= 20_000)
        .sort((a, b) => b.timestamp - a.timestamp)[0] || null
    );
  }

  // Safely retrieves and parses tab data from localStorage
  private _getTabs(storageKey: string): StoredTab[] {
    const existing = this._storage.getItem(storageKey);
    if (!existing) {
      return [];
    }

    try {
      const entries = JSON.parse(existing) as StoredTab[];
      // Validate entries array
      if (!Array.isArray(entries)) {
        this._diag.warn('Invalid entries format in storage, resetting');
        return [];
      }
      return entries;
    } catch (e) {
      this._diag.warn('Failed to parse existing entries, starting fresh', e);
      return [];
    }
  }

  private _pruneTabEntries(
    storedTabs: StoredTab[],
    replaceCurrent = false
  ): StoredTab[] {
    const now = Date.now();

    // Keep tabs from the last 30 seconds (potential parents for new tabs)
    // If replaceCurrent is true, also remove any previous entries from this tab
    const filteredTabs = storedTabs.filter(
      storedTab =>
        now - storedTab.timestamp <= 30_000 &&
        (!replaceCurrent || storedTab.tabId !== this._currentTab.tabId)
    );

    // Keep only last 5 entries if data is too large
    return JSON.stringify(filteredTabs).length > 50_000 // 50KB
      ? filteredTabs.slice(-5)
      : filteredTabs;
  }

  // Converts URL to a short deterministic hash for storage keys
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private _hashUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return '0';
    }

    const urlToHash = url.length > 300 ? url.substring(0, 300) : url;

    // Simple djb2 hash (XOR variant) https://gist.github.com/hmic/1676398
    let hash = 5381;
    for (let i = 0; i < urlToHash.length; i++) {
      hash = ((hash << 5) + hash) ^ urlToHash.charCodeAt(i); // hash * 33 ^ c
    }

    // Convert to positive number and base36
    return (hash >>> 0).toString(36);
  }

  // Public getters for cross-tab data
  public getExperienceId(): string | null {
    return this._currentTab.experienceId;
  }

  public getTabId(): string | null {
    return this._currentTab.tabId;
  }

  public getParentTabId(): string | null {
    return this._currentTab.parentTabId || null;
  }

  // Removes stale tab data (>30 minutes old) from localStorage to free up space
  private _cleanupOldTabs(): void {
    try {
      const now = Date.now();
      const thirtyMinutesAgo = now - 30 * 60 * 1000; // 30 minutes
      const keysToRemove: string[] = [];

      for (let i = 0; i < this._storage.length; i++) {
        const key = this._storage.key(i);
        if (key?.startsWith(EMBRACE_TAB_STORAGE_KEY_PREFIX)) {
          const stored = this._storage.getItem(key);
          if (stored) {
            try {
              const entries = JSON.parse(stored) as StoredTab[];
              // Check if all entries are old
              if (
                Array.isArray(entries) &&
                entries.every(entry => entry.timestamp < thirtyMinutesAgo)
              ) {
                keysToRemove.push(key);
              }
            } catch {
              // Remove corrupted data
              keysToRemove.push(key);
            }
          }
        }
      }

      keysToRemove.forEach(key => {
        this._storage.removeItem(key);
      });
    } catch (e) {
      this._diag.debug('Failed to clear old tab data', e);
    }
  }

  // Listens for clicks that might open new tabs to track parent-child relationships
  private _setupListeners(url = window.location.href): void {
    const handleNewTabAction = (e: MouseEvent) => {
      // Detect clicks that typically open new tabs
      const isNewTabAction =
        e.button === 1 ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        (e.target as HTMLElement).closest('[target="_blank"]');

      if (isNewTabAction) {
        this._updateTab(url, true);
      }
    };

    // Capture phase ensures we record before navigation
    const options = { capture: true, passive: true };
    document.addEventListener('auxclick', handleNewTabAction, options);
    document.addEventListener('click', handleNewTabAction, options);
  }

  // Stores tab data in localStorage so new tabs can find their parent
  // Handles storage quota by cleaning up old data if needed
  private _updateTab(url = window.location.href, replaceCurrent = false): void {
    const data: StoredTab = {
      tabId: this._currentTab.tabId,
      experienceId: this._currentTab.experienceId,
      timestamp: Date.now(),
    };

    const urlStorageKey = `${EMBRACE_TAB_STORAGE_KEY_PREFIX}${this._hashUrl(url)}`;

    try {
      let entries = this._getTabs(urlStorageKey);
      entries = this._pruneTabEntries(entries, replaceCurrent);
      entries.push(data);

      try {
        this._storage.setItem(urlStorageKey, JSON.stringify(entries));
      } catch (error) {
        // Handle quota exceeded error
        if (error instanceof Error && error.name === 'QuotaExceededError') {
          this._diag.warn('Storage quota exceeded, clearing old data');
          this._cleanupOldTabs();
          // Try once more with just the current tab data
          try {
            this._storage.setItem(urlStorageKey, JSON.stringify([data]));
          } catch (retryError) {
            this._diag.warn(
              'Failed to store data even after cleanup',
              retryError
            );
          }
        } else {
          throw error;
        }
      }
    } catch (e) {
      this._diag.debug('Failed to update tab data', e);
    }
  }
}
