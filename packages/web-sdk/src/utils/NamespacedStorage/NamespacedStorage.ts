import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';

export interface NamespacedStorageArgs {
  storage: Storage;
  namespace?: string;
  diag?: DiagLogger;
}

/**
 * `Storage` wrapper that isolates the SDK from storage errors and
 * optionally namespaces keys with a prefix.
 *
 * Read failures (`getItem`, `key`, `length`) log at warn level.
 *
 * The first `setItem` failure puts the wrapper into a sticky
 * write-disabled state and logs once at error level. Subsequent
 * `setItem` calls become no-ops so a one-time quota error or revoked
 * permission does not keep throwing on every attempt. Reads, removes,
 * and clears continue to work.
 *
 * An empty namespace skips the key prefix; the wrapper then exposes the
 * underlying storage's full keyspace with only the safety layer applied.
 */
export class NamespacedStorage implements Storage {
  private readonly _diag: DiagLogger;
  private readonly _keyPrefix: string;
  private readonly _storage: Storage;
  private _writeDisabled = false;

  public constructor({
    namespace,
    storage,
    diag: diagParam,
  }: NamespacedStorageArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({ namespace: 'NamespacedStorage' });
    this._keyPrefix = namespace ? `${namespace}_` : '';
    this._storage = storage;
  }

  protected getNamespacedKeys(): string[] {
    const keys: string[] = [];
    let length: number;
    try {
      length = this._storage.length;
    } catch (e) {
      this._diag.warn('failed to read storage length', String(e));
      return keys;
    }
    for (let i = 0; i < length; i++) {
      try {
        const key = this._storage.key(i);
        if (key?.startsWith(this._keyPrefix)) {
          keys.push(key.substring(this._keyPrefix.length));
        }
      } catch (e) {
        this._diag.warn(
          `failed to read storage key at index ${i.toString()}`,
          String(e),
        );
      }
    }
    return keys;
  }

  public get length(): number {
    return this.getNamespacedKeys().length;
  }

  public clear(): void {
    for (const key of this.getNamespacedKeys()) {
      this._safeRemove(`${this._keyPrefix}${key}`);
    }
  }

  public getItem(key: string): string | null {
    try {
      return this._storage.getItem(`${this._keyPrefix}${key}`);
    } catch (e) {
      this._diag.warn(`failed to read ${key}`, String(e));
      return null;
    }
  }

  public key(index: number): string | null {
    return this.getNamespacedKeys()[index] || null;
  }

  public removeItem(key: string): void {
    this._safeRemove(`${this._keyPrefix}${key}`);
  }

  public setItem(key: string, value: string): void {
    if (this._writeDisabled) {
      return;
    }
    try {
      this._storage.setItem(`${this._keyPrefix}${key}`, value);
    } catch (e) {
      this._disableWrites(e);
    }
  }

  private _safeRemove(namespacedKey: string): void {
    try {
      this._storage.removeItem(namespacedKey);
    } catch (e) {
      this._diag.warn(`failed to remove ${namespacedKey}`, String(e));
    }
  }

  // Log only error.name: error.message can leak the value on some browsers.
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
