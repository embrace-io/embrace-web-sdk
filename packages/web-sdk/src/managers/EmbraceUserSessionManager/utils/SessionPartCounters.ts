import type { DiagLogger } from '@opentelemetry/api';
import type { NamespacedStorage } from '../../../utils/index.ts';
import { getIncrementedCount, getStoredCount } from '../../../utils/index.ts';
import { EMBRACE_SESSION_PART_NUMBER_KEY } from '../constants.ts';

const OBJECT_STORE = 'counters';
const SESSION_PART_NUMBER_KEY = 'session_part_number';
const USER_SESSION_PART_INDEX_KEY = 'user_session_part_index';

export interface SessionPartCounts {
  readonly sessionPartNumber: number;
  readonly userSessionPartIndex: number;
}

export interface IncrementSessionPartCountsArgs {
  readonly userSessionId: string;
  /**
   * The part index on the user-session row. The increment starts from it when
   * it's higher, so numbering continues from SDK versions that only count
   * there.
   */
  readonly storedUserSessionPartIndex: number;
}

/** Hands out the counters of a session part that's starting. */
export interface SessionPartCounters {
  increment(args: IncrementSessionPartCountsArgs): Promise<SessionPartCounts>;
}

export interface LocalStorageSessionPartCountersArgs {
  storage: NamespacedStorage;
  diag: DiagLogger;
}

/**
 * Increments the counters in `localStorage`. Two tabs can read the same values
 * there and hand out the same increment.
 */
export class LocalStorageSessionPartCounters implements SessionPartCounters {
  private readonly _storage: NamespacedStorage;
  private readonly _diag: DiagLogger;

  public constructor({ storage, diag }: LocalStorageSessionPartCountersArgs) {
    this._storage = storage;
    this._diag = diag;
  }

  public async increment({
    storedUserSessionPartIndex,
  }: IncrementSessionPartCountsArgs): Promise<SessionPartCounts> {
    return {
      sessionPartNumber: getIncrementedCount(
        this._storage,
        EMBRACE_SESSION_PART_NUMBER_KEY,
        this._diag,
      ),
      userSessionPartIndex: storedUserSessionPartIndex + 1,
    };
  }
}

export interface IndexedDBSessionPartCountersArgs {
  /** Keeps the counters apart per app, like the SDK's `localStorage` keys. */
  namespace?: string;
  storage: NamespacedStorage;
  diag: DiagLogger;
}

interface StoredUserSessionPartIndex {
  readonly userSessionId: string;
  readonly value: number;
}

/**
 * Increments both counters in one IndexedDB `readwrite` transaction. Browsers
 * run those one at a time across tabs, so two session parts never get the same
 * values. The part index is kept for one user session at a time, and starts
 * over from the user-session row's when the user session changes. When
 * IndexedDB can't be used, the counters are incremented in `localStorage`.
 */
export class IndexedDBSessionPartCounters implements SessionPartCounters {
  private readonly _databaseName: string;
  private readonly _storage: NamespacedStorage;
  private readonly _diag: DiagLogger;
  private readonly _fallback: LocalStorageSessionPartCounters;
  // A failed open stays failed for the page, so every increment falls back.
  private _database: Promise<IDBDatabase> | null = null;

  public constructor({
    namespace,
    storage,
    diag,
  }: IndexedDBSessionPartCountersArgs) {
    this._databaseName = namespace
      ? `${namespace}__embrace_session_part_counters`
      : 'embrace_session_part_counters';
    this._storage = storage;
    this._diag = diag;
    this._fallback = new LocalStorageSessionPartCounters({ storage, diag });
  }

  public async increment(
    args: IncrementSessionPartCountsArgs,
  ): Promise<SessionPartCounts> {
    let counts: SessionPartCounts;

    try {
      counts = await this._incrementInDatabase(args);
    } catch (error) {
      this._diag.warn(
        'failed to increment the session part counters in IndexedDB; incrementing them in localStorage',
        error,
      );

      return this._fallback.increment(args);
    }

    // TODO: stop writing the part number back to localStorage once SDK
    // versions that increment it there are no longer in use.
    this._storage.setItem(
      EMBRACE_SESSION_PART_NUMBER_KEY,
      String(
        Math.max(this._readStoredSessionPartNumber(), counts.sessionPartNumber),
      ),
    );

    return counts;
  }

  private async _incrementInDatabase({
    userSessionId,
    storedUserSessionPartIndex,
  }: IncrementSessionPartCountsArgs): Promise<SessionPartCounts> {
    const database = await this._open();
    const storedSessionPartNumber = this._readStoredSessionPartNumber();

    return new Promise<SessionPartCounts>((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE, 'readwrite');
      const store = transaction.objectStore(OBJECT_STORE);
      const numberRequest = store.get(SESSION_PART_NUMBER_KEY);
      const indexRequest = store.get(USER_SESSION_PART_INDEX_KEY);
      let counts: SessionPartCounts | null = null;

      // Requests run in order, so both reads are done here.
      indexRequest.onsuccess = () => {
        const storedNumber: unknown = numberRequest.result;
        const storedIndex = indexRequest.result as
          | StoredUserSessionPartIndex
          | undefined;

        counts = {
          sessionPartNumber:
            Math.max(
              typeof storedNumber === 'number' ? storedNumber : 0,
              storedSessionPartNumber,
            ) + 1,
          userSessionPartIndex:
            Math.max(
              storedIndex?.userSessionId === userSessionId
                ? storedIndex.value
                : 0,
              storedUserSessionPartIndex,
            ) + 1,
        };

        const index: StoredUserSessionPartIndex = {
          userSessionId,
          value: counts.userSessionPartIndex,
        };

        store.put(counts.sessionPartNumber, SESSION_PART_NUMBER_KEY);
        store.put(index, USER_SESSION_PART_INDEX_KEY);
      };
      transaction.oncomplete = () => {
        if (counts) {
          resolve(counts);
        } else {
          reject(new Error('session part counters were not read'));
        }
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error('transaction failed'));
      };
      transaction.onabort = () => {
        reject(transaction.error ?? new Error('transaction aborted'));
      };
    });
  }

  private _readStoredSessionPartNumber(): number {
    return getStoredCount(
      this._storage,
      EMBRACE_SESSION_PART_NUMBER_KEY,
      this._diag,
    );
  }

  private _open(): Promise<IDBDatabase> {
    if (!this._database) {
      // Reading `indexedDB` or opening the database can throw when the page
      // can't use it, which rejects here.
      this._database = new Promise((resolve, reject) => {
        const request = indexedDB.open(this._databaseName, 1);

        request.onupgradeneeded = () => {
          request.result.createObjectStore(OBJECT_STORE);
        };
        request.onsuccess = () => {
          const database = request.result;

          // Closes so another tab can delete or upgrade the database. The next
          // increment opens it again.
          database.onversionchange = () => {
            database.close();
            this._database = null;
          };
          resolve(database);
        };
        request.onerror = () => {
          reject(request.error ?? new Error('failed to open IndexedDB'));
        };
      });
    }

    return this._database;
  }
}
