import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import { InMemoryStorage } from '../InMemoryStorage/index.ts';

interface NamespacedStorageArgs {
  storage: Storage;
  namespace?: string;
  diag?: DiagLogger;
}

/**
 * `Storage`-shaped wrapper that isolates the SDK from storage errors and
 * optionally namespaces keys with a prefix. Mutation methods return `true`
 * on success and `false` when the call failed or writes have been disabled.
 *
 * Read failures (`getItem`, `key`, `length`) log at warn level and degrade
 * to `null`/empty results.
 *
 * The first `setItem` failure flips a sticky `_writeDisabled` flag and
 * emits one error, so a one-time quota error or revoked permission does not
 * keep throwing on every attempt. The wrapper then copies its keys into an
 * `InMemoryStorage` and uses that for the rest of the page, so the SDK keeps
 * its own state even though nothing more reaches storage. `setItem` keeps
 * returning `false`, so callers that need a value to persist can reject it.
 *
 * An empty namespace skips the key prefix; the wrapper then exposes the
 * underlying storage's full keyspace with only the safety layer applied.
 */
export class NamespacedStorage {
  private readonly _diag: DiagLogger;
  private readonly _keyPrefix: string;
  private _storage: Storage;
  private _writeDisabled: boolean = false;

  /**
   * Wraps the page's `localStorage` or `sessionStorage`, or an
   * `InMemoryStorage` when the page can't access it. Reading the getter throws
   * a `SecurityError` when the browser blocks storage for the page (cookies
   * blocked for the site, sandboxed iframes), and some webviews return null.
   */
  public static fromWindow(
    name: 'localStorage' | 'sessionStorage',
    args: Omit<NamespacedStorageArgs, 'storage'>,
  ): NamespacedStorage {
    let failure: unknown = `${name} is null`;

    try {
      const storage = window[name] as Storage | null;

      if (storage) {
        return new NamespacedStorage({ ...args, storage });
      }
    } catch (error) {
      failure = error;
    }

    const inMemory = new NamespacedStorage({
      ...args,
      storage: new InMemoryStorage(),
    });

    inMemory._diag.warn(
      `${name} is not accessible; keeping its data in memory for this page`,
      String(failure),
    );

    return inMemory;
  }

  public constructor({
    namespace,
    storage,
    diag: diagParam,
  }: NamespacedStorageArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({ namespace: 'NamespacedStorage' });
    this._keyPrefix = namespace ? `${namespace}__` : '';
    this._storage = storage;
  }

  /**
   * Logical keys when namespaced; raw underlying keys otherwise (may include
   * foreign keys sharing the origin's storage). Best-effort: indices that
   * throw are skipped, returns empty on bulk failure.
   */
  public keys(): string[] {
    let length: number;
    try {
      length = this._storage.length;
    } catch (e) {
      this._diag.warn('failed to read storage length', String(e));
      return [];
    }
    const result: string[] = [];
    for (let i = 0; i < length; i++) {
      try {
        const key = this._storage.key(i);
        if (key === null) {
          continue;
        }
        if (this._keyPrefix) {
          if (key.startsWith(this._keyPrefix)) {
            result.push(key.substring(this._keyPrefix.length));
          }
        } else {
          result.push(key);
        }
      } catch (e) {
        this._diag.warn(
          `failed to read storage key at index ${i.toString()}`,
          String(e),
        );
      }
    }
    return result;
  }

  public get length(): number {
    return this.keys().length;
  }

  public clear(): boolean {
    let allRemoved = true;
    for (const key of this.keys()) {
      if (!this._safeRemove(this._keyName(key))) {
        allRemoved = false;
      }
    }
    return allRemoved;
  }

  public getItem(key: string): string | null {
    try {
      return this._storage.getItem(this._keyName(key));
    } catch (e) {
      this._diag.warn(`failed to read ${key}`, String(e));
      return null;
    }
  }

  public key(index: number): string | null {
    return this.keys()[index] ?? null;
  }

  public removeItem(key: string): boolean {
    return this._safeRemove(this._keyName(key));
  }

  public setItem(key: string, value: string): boolean {
    const keyName = this._keyName(key);

    if (!this._writeDisabled) {
      try {
        this._storage.setItem(keyName, value);

        return true;
      } catch (e) {
        this._switchToMemory(e);
      }
    }

    this._storage.setItem(keyName, value);

    return false;
  }

  private _keyName(key: string): string {
    return `${this._keyPrefix}${key}`;
  }

  private _safeRemove(keyName: string): boolean {
    try {
      this._storage.removeItem(keyName);
      return true;
    } catch (e) {
      this._diag.warn(`failed to remove ${keyName}`, String(e));
      return false;
    }
  }

  // Log only error.name: error.message can leak the stored value on some browsers.
  private _switchToMemory(error: unknown): void {
    const memory = new InMemoryStorage();

    // Copied first, so the page keeps reading what it stored before the failure.
    for (const key of this.keys()) {
      const value = this.getItem(key);

      if (value !== null) {
        memory.setItem(this._keyName(key), value);
      }
    }

    this._storage = memory;
    this._writeDisabled = true;

    const errorName = error instanceof Error ? error.name : 'UnknownError';

    this._diag.error(
      'writes disabled after failure; continuing in-memory only',
      errorName,
    );
  }
}
