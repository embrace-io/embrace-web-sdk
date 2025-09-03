import { diag } from '@opentelemetry/api';
import type { DiagLogger, AttributeValue } from '@opentelemetry/api';
import { generateUUID } from '../../utils/index.js';
import { getAppInstanceId } from '../../resources/index.js';
import {
  KEY_EMB_EXPERIENCE_ID,
  KEY_EMB_APP_INSTANCE_ID,
  KEY_EMB_TAB_OPEN_METHOD,
  KEY_EMB_REFERRER_TYPE,
  KEY_EMB_REFERRER_PATH,
  KEY_EMB_REFERRER_DOMAIN,
  KEY_EMB_PREVIOUS_TAB_ID,
} from '../../constants/index.js';
import type {
  ExperienceData,
  EmbraceExperienceManagerArgs,
  TabOpenMethod,
  ReferrerType,
} from './types.js';

// Storage keys
const TAB_EXPERIENCE_KEY = 'embrace_experience';
const INHERITANCE_KEY_PREFIX = 'embrace_inheritance_';
const INHERITANCE_REFERRER_PREFIX = 'embrace_inheritanceref_';

// Constants
const INHERITANCE_CLEANUP_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cache current origin to avoid repeated URL parsing
const CURRENT_ORIGIN = window.location.origin;

// Internal types
interface InheritanceData {
  experienceId: string;
  sourceTabId: string;
  timestamp: number;
  url?: string;
}

type InheritedExperience = Pick<
  InheritanceData,
  'experienceId' | 'sourceTabId'
>;

// Combined tab context detection result
interface TabContext {
  tabOpenMethod: TabOpenMethod;
  referrerType: ReferrerType;
}

/**
 * Experience Manager assigns persistent experience IDs
 * - Each tab gets a single experience ID that never changes
 * - IDs are either generated new or inherited from parent tab
 * - Experience IDs are removed from storage after 24 hours of inactivity
 */
export class EmbraceExperienceManager {
  private readonly _currentExperienceId: string;
  private readonly _appInstanceId: string;
  private readonly _diag: DiagLogger;
  private readonly _experienceData: ExperienceData;
  private readonly _storage: Storage;
  private readonly _sessionStorage: Storage;
  private _referrerDomain: string | null = null;
  private _referrerPath: string | null = null;

  public constructor({
    diag: diagParam,
    storage = window.localStorage,
    sessionStorage = window.sessionStorage,
  }: EmbraceExperienceManagerArgs = {}) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'embrace-experience-manager',
      });

    this._storage = storage;
    this._sessionStorage = sessionStorage;
    this._appInstanceId = getAppInstanceId(this._sessionStorage, this._diag);

    // Detect tab context (how opened + referrer) in one go
    const tabContext = this._detectTabContext();

    // Check for existing experience data (refresh/back button)
    const existingData = this._getStoredExperienceData();

    if (existingData) {
      // Preserve ID, update navigation context
      this._currentExperienceId = existingData.experienceId;
      this._experienceData = {
        ...existingData,
        lastActivityAt: Date.now(),
        tabOpenMethod: tabContext.tabOpenMethod,
        referrerType: tabContext.referrerType,
      };
    } else {
      // New tab - check for inheritance or generate new ID
      const inheritanceData = this._checkForInheritance(
        tabContext.tabOpenMethod
      );

      // Use inherited ID or generate new one
      const experienceId = inheritanceData?.experienceId;

      this._currentExperienceId = experienceId ?? generateUUID();

      this._experienceData = {
        experienceId: this._currentExperienceId,
        lastActivityAt: Date.now(),
        tabOpenMethod: tabContext.tabOpenMethod,
        referrerType: tabContext.referrerType,
        ...(inheritanceData && { previousTabId: inheritanceData.sourceTabId }),
      };
    }

    // Pre-compute referrer domain/path for getExperienceAttributes
    this._precomputeReferrerInfo();

    // Store data and enable inheritance for child tabs
    this._storeExperienceData();
    this._storeInheritanceData();

    this._diag.debug('Experience initialized:', {
      experienceId: this._currentExperienceId,
      appInstanceId: this._appInstanceId,
      tabOpenMethod: tabContext.tabOpenMethod,
      referrerType: tabContext.referrerType,
      previousTabId: this._experienceData.previousTabId,
    });
  }

  /**
   * Detect tab context including how it was opened and referrer info
   * Combines tab open method and referrer analysis for efficiency
   */
  private _detectTabContext(): TabContext {
    try {
      // Calculate referrer type once at the start
      let referrerType: ReferrerType = 'none';
      if (document.referrer) {
        referrerType = EmbraceExperienceManager._isSameOrigin(document.referrer)
          ? 'same_origin'
          : 'external';
      }

      // 1. Check performance navigation (reload/back_forward)
      const navEntries = performance.getEntriesByType('navigation');
      if (navEntries.length > 0) {
        const navType = navEntries[0].type;
        if (navType === 'reload' || navType === 'back_forward') {
          return {
            tabOpenMethod: navType as TabOpenMethod,
            referrerType,
          };
        }
      }

      // 2. Check if opened via window.open()
      if (window.opener !== null) {
        return {
          tabOpenMethod: 'window_opener',
          referrerType,
        };
      }

      // 3. Check referrer for navigation type
      if (document.referrer) {
        return {
          tabOpenMethod:
            referrerType === 'same_origin'
              ? 'same_origin_link'
              : 'external_link',
          referrerType,
        };
      }

      // 4. No referrer - manual new tab
      return {
        tabOpenMethod: 'manual_new_tab',
        referrerType: 'none',
      };
    } catch (error) {
      this._diag.warn('Failed to detect tab context:', error);
      return {
        tabOpenMethod: 'unknown',
        referrerType: 'none',
      };
    }
  }

  private static _isSameOrigin(url: string): boolean {
    try {
      const otherUrl = new URL(url);
      return otherUrl.origin === CURRENT_ORIGIN;
    } catch {
      return false;
    }
  }

  private _checkForInheritance(
    tabOpenMethod: TabOpenMethod
  ): InheritedExperience | null {
    // Only inherit for specific navigation types
    if (
      tabOpenMethod !== 'window_opener' &&
      tabOpenMethod !== 'same_origin_link'
    ) {
      return null;
    }

    try {
      // Try referrer-based lookup first (most accurate)
      const byReferrer = this._findInheritanceByReferrer();
      if (byReferrer) {
        return byReferrer;
      }

      // Fallback to most recent inheritance entry
      return this._findMostRecentInheritance();
    } catch (error) {
      this._diag.warn('Failed to check inheritance data:', error);
      return null;
    }
  }

  private _findInheritanceByReferrer(): InheritedExperience | null {
    if (!document.referrer) return null;

    const referrerKey = EmbraceExperienceManager._createReferrerKey(
      document.referrer
    );
    if (!referrerKey) {
      return null;
    }

    const data = this._getInheritanceData(
      `${INHERITANCE_REFERRER_PREFIX}${referrerKey}`
    );

    if (data) {
      return data;
    }

    return null;
  }

  private _findMostRecentInheritance(): InheritedExperience | null {
    let bestCandidate: InheritedExperience | null = null;
    let mostRecentTime = 0;
    let bestKey: string | null = null;

    // Iterate through storage once, but only parse the best candidate
    for (let i = 0; i < this._storage.length; i++) {
      const key = this._storage.key(i);
      if (!key?.startsWith(INHERITANCE_KEY_PREFIX)) {
        continue;
      }

      try {
        // Get just the timestamp without parsing the full object
        const stored = this._storage.getItem(key);
        if (!stored) continue;

        // Quick check for timestamp in JSON string
        const timestampMatch = stored.match(/"timestamp":(\d+)/);
        if (!timestampMatch) continue;

        const timestamp = parseInt(timestampMatch[1], 10);
        if (timestamp > mostRecentTime) {
          mostRecentTime = timestamp;
          bestKey = key;
        }
      } catch {
        // Skip invalid entries
        continue;
      }
    }

    // Only parse the full data for the best candidate
    if (bestKey) {
      const data = this._getInheritanceData(bestKey);
      if (data) {
        bestCandidate = {
          experienceId: data.experienceId,
          sourceTabId: data.sourceTabId,
        };
      }
    }

    return bestCandidate;
  }

  private _getInheritanceData(key: string): InheritanceData | null {
    try {
      const stored = this._storage.getItem(key);
      if (!stored) {
        return null;
      }

      const data = JSON.parse(stored) as InheritanceData;

      if (data.experienceId && data.sourceTabId && data.timestamp) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }

  private _storeInheritanceData(): void {
    // Skip storing if this tab came from an external source and can't be a parent
    const cannotBeParent =
      this._experienceData.tabOpenMethod === 'external_link';

    if (cannotBeParent) {
      return;
    }

    const experienceData: InheritanceData = {
      experienceId: this._currentExperienceId,
      sourceTabId: this._appInstanceId,
      timestamp: Date.now(),
      url: window.location.href,
    };
    const experienceDataStr = JSON.stringify(experienceData);

    try {
      // Store with tab-specific key
      this._storage.setItem(
        `${INHERITANCE_KEY_PREFIX}${this._appInstanceId}`,
        experienceDataStr
      );

      // Store with referrer-based key for accurate child matching
      const referrerKey = EmbraceExperienceManager._createReferrerKey(
        window.location.href
      );
      if (referrerKey) {
        this._storage.setItem(
          `${INHERITANCE_REFERRER_PREFIX}${referrerKey}`,
          experienceDataStr
        );
      }
    } catch (error) {
      // Check if this is a quota exceeded error
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this._diag.warn('Storage quota exceeded, attempting cleanup');
        // Force aggressive cleanup and retry once
        this._cleanupOldInheritance(true);
        try {
          // Reuse the already stringified data
          this._storage.setItem(
            `${INHERITANCE_KEY_PREFIX}${this._appInstanceId}`,
            experienceDataStr
          );
        } catch (retryError) {
          this._diag.error(
            'Failed to store inheritance after cleanup:',
            retryError
          );
        }
      } else {
        this._diag.warn('Failed to store inheritance data:', error);
      }
    }
  }

  private static _createReferrerKey(url: string): string | null {
    try {
      // Create a simple hash of the URL for matching
      // This helps child tabs find their parent's data
      const urlObj = new URL(url);
      // Use pathname and search to create a unique key
      const keySource = `${urlObj.origin}${urlObj.pathname}${urlObj.search}`;

      // Simple hash function for the key
      let hash = 0;
      for (let i = 0; i < keySource.length; i++) {
        const char = keySource.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
      }

      return Math.abs(hash).toString(36);
    } catch {
      return null;
    }
  }

  private _cleanupOldInheritance(aggressive = false): void {
    try {
      const now = Date.now();
      const maxAge = aggressive
        ? INHERITANCE_CLEANUP_AGE_MS / 2
        : INHERITANCE_CLEANUP_AGE_MS;

      let cleanedCount = 0;
      const keysToRemove: string[] = [];

      // Single pass through storage
      for (let i = 0; i < this._storage.length; i++) {
        const key = this._storage.key(i);
        if (
          !key ||
          (!key.startsWith(INHERITANCE_KEY_PREFIX) &&
            !key.startsWith(INHERITANCE_REFERRER_PREFIX))
        ) {
          continue;
        }

        // Don't remove our own data unless aggressive mode
        if (
          !aggressive &&
          key === `${INHERITANCE_KEY_PREFIX}${this._appInstanceId}`
        ) {
          continue;
        }

        // Quick timestamp check without full parsing
        try {
          const stored = this._storage.getItem(key);
          if (!stored) {
            keysToRemove.push(key);
            continue;
          }

          const timestampMatch = stored.match(/"timestamp":(\d+)/);
          if (!timestampMatch) {
            keysToRemove.push(key); // Remove invalid entries
            continue;
          }

          const timestamp = parseInt(timestampMatch[1], 10);
          if (now - timestamp > maxAge) {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key); // Remove problematic entries
        }
      }

      // Batch remove to avoid modifying storage during iteration
      for (const key of keysToRemove) {
        this._storage.removeItem(key);
        cleanedCount++;
      }

      if (cleanedCount > 0) {
        this._diag.debug(
          `Cleaned up ${cleanedCount} old inheritance entries${aggressive ? ' (aggressive)' : ''}`
        );
      }
    } catch (error) {
      this._diag.warn('Failed to cleanup old inheritance data:', error);
    }
  }

  private _getStoredExperienceData(): ExperienceData | null {
    try {
      const stored = this._sessionStorage.getItem(TAB_EXPERIENCE_KEY);
      return stored ? (JSON.parse(stored) as ExperienceData) : null;
    } catch (error) {
      this._diag.warn('Failed to get stored experience data:', error);
      return null;
    }
  }

  private _storeExperienceData(): void {
    try {
      this._sessionStorage.setItem(
        TAB_EXPERIENCE_KEY,
        JSON.stringify(this._experienceData)
      );
    } catch (error) {
      this._diag.warn('Failed to store experience data:', error);
    }
  }

  /**
   * Get the current experience ID (never changes for this tab)
   */
  public getExperienceId(): string {
    return this._currentExperienceId;
  }

  /**
   * Get the app instance ID (unique per tab)
   */
  public getAppInstanceId(): string {
    return this._appInstanceId;
  }

  /**
   * Get the previous tab ID if this session inherited from another tab
   */
  public getPreviousTabId(): string | null {
    return this._experienceData.previousTabId ?? null;
  }

  /**
   * Get the tab open method for this tab
   */
  public getTabOpenMethod(): string {
    return this._experienceData.tabOpenMethod;
  }

  /**
   * Get the referrer type for this tab
   */
  public getReferrerType(): string {
    return this._experienceData.referrerType;
  }

  /**
   * Pre-compute referrer domain/path to avoid repeated URL parsing
   */
  private _precomputeReferrerInfo(): void {
    const referrer = document.referrer;
    if (!referrer) {
      return;
    }

    try {
      const url = new URL(referrer);
      if (this._experienceData.referrerType === 'same_origin') {
        this._referrerPath = url.pathname;
      } else {
        this._referrerDomain = url.hostname;
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  /**
   * Update the last activity timestamp
   * Called on session start/end events
   */
  public updateLastActivity(): void {
    this._experienceData.lastActivityAt = Date.now();
    this._storeExperienceData();
  }

  /**
   * Get all experience attributes for session spans
   * Updates last activity timestamp on each call
   */
  public getExperienceAttributes(): Record<string, AttributeValue> {
    // Update last activity timestamp
    this.updateLastActivity();

    // Build attributes
    const attributes: Record<string, AttributeValue> = {
      [KEY_EMB_EXPERIENCE_ID]: this._currentExperienceId,
      [KEY_EMB_APP_INSTANCE_ID]: this._appInstanceId,
      [KEY_EMB_TAB_OPEN_METHOD]: this._experienceData.tabOpenMethod,
      [KEY_EMB_REFERRER_TYPE]: this._experienceData.referrerType,
    };

    // Include previous tab ID if this session inherited from another tab
    if (this._experienceData.previousTabId) {
      attributes[KEY_EMB_PREVIOUS_TAB_ID] = this._experienceData.previousTabId;
    }

    // Use pre-computed referrer info to avoid repeated URL parsing
    if (this._referrerPath) {
      attributes[KEY_EMB_REFERRER_PATH] = this._referrerPath;
    } else if (this._referrerDomain) {
      attributes[KEY_EMB_REFERRER_DOMAIN] = this._referrerDomain;
    }

    return attributes;
  }
}
