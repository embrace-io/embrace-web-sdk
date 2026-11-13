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
 * optionally namespaces keys with a prefix. `setItem` returns `false` when the
 * value didn't reach storage; `removeItem` and `clear` return `false` when
 * removing from storage failed.
 *
 * Read failures (`getItem`, `key`, `length`) log at warn level and degrade
 * to `null`/empty results.
 *
 * The first `setItem` failure flips a sticky `_writeDisabled` flag and
 * emits one error, so a one-time quota error or revoked permission does not
 * keep throwing on every attempt. Writes from then on are kept in memory for
 * the page and read before storage, so the SDK keeps its own state. Removals
 * still reach storage, since removing needs no quota.
 *
 * An empty namespace skips the key prefix; the wrapper then exposes the
 * underlying storage's full keyspace with only the safety layer applied.
 */
export class NamespacedStorage {
  private readonly _diag: DiagLogger;
  private readonly _keyPrefix: string;
  private readonly _storage: Storage;
  private _writeDisabled: boolean = false;
  // Writes that failed to reach storage, read before it.
  private readonly _unsaved = new Map<string, string>();

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
   * foreign keys sharing the origin's storage), plus writes that failed to
   * reach storage. Best-effort: indices that throw are skipped, and a failed
   * length read skips the underlying keys.
   */
  public keys(): string[] {
    const result: string[] = [];
    let length = 0;

    try {
      length = this._storage.length;
    } catch (e) {
      this._diag.warn('failed to read storage length', String(e));
    }

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

    for (const keyName of this._unsaved.keys()) {
      const key = keyName.substring(this._keyPrefix.length);

      if (!result.includes(key)) {
        result.push(key);
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
    const keyName = this._keyName(key);
    const unsaved = this._unsaved.get(keyName);

    if (unsaved !== undefined) {
      return unsaved;
    }

    try {
      return this._storage.getItem(keyName);
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
        this._disableWrites(e);
      }
    }

    this._unsaved.set(keyName, value);

    return false;
  }

  private _keyName(key: string): string {
    return `${this._keyPrefix}${key}`;
  }

  private _safeRemove(keyName: string): boolean {
    this._unsaved.delete(keyName);

    try {
      this._storage.removeItem(keyName);
      return true;
    } catch (e) {
      this._diag.warn(`failed to remove ${keyName}`, String(e));
      return false;
    }
  }

  // Log only error.name: error.message can leak the stored value on some browsers.
  private _disableWrites(error: unknown): void {
    if (this._writeDisabled) {
      return;
    }
    this._writeDisabled = true;
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    this._diag.error(
      'writes disabled after failure; continuing in-memory only',
      errorName,
    );
  }
}
