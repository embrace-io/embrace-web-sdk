/**
 * Marker interface for a `Storage` that prefixes keys with a per-instance
 * namespace and exposes the prefixed (underlying) key for cross-tab
 * `storage` event matching.
 *
 * Use the `isNamespacedStorageLike` helper below when accepting a `Storage`
 * that may or may not be namespaced; do not use a structural cast.
 */
export interface NamespacedStorageLike {
  getStorageEventKey(logicalKey: string): string;
  keys(): string[];
}

export const isNamespacedStorageLike = (
  storage: Storage,
): storage is Storage & NamespacedStorageLike =>
  typeof (storage as Partial<NamespacedStorageLike>).getStorageEventKey ===
  'function';

export class NamespacedStorage implements Storage, NamespacedStorageLike {
  private readonly _keyPrefix: string;
  private readonly _storage: Storage;

  public constructor(namespace: string, storage: Storage) {
    this._keyPrefix = `${namespace}_`;
    this._storage = storage;
  }

  private _getNamespacedKeys(): string[] {
    const result: string[] = [];
    for (let i = 0; i < this._storage.length; i++) {
      const key = this._storage.key(i);
      if (key?.startsWith(this._keyPrefix)) {
        result.push(key.substring(this._keyPrefix.length));
      }
    }
    return result;
  }

  public keys(): string[] {
    return this._getNamespacedKeys();
  }

  public get length(): number {
    return this._getNamespacedKeys().length;
  }

  public clear(): void {
    // Snapshot before removal: removeItem shifts indices mid-iteration.
    const toRemove: string[] = [];
    for (let i = 0; i < this._storage.length; i++) {
      const key = this._storage.key(i);
      if (key?.startsWith(this._keyPrefix)) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      this._storage.removeItem(key);
    }
  }

  public getItem(key: string): string | null {
    return this._storage.getItem(`${this._keyPrefix}${key}`);
  }

  public key(index: number): string | null {
    return this._getNamespacedKeys()[index] ?? null;
  }

  public removeItem(key: string): void {
    this._storage.removeItem(`${this._keyPrefix}${key}`);
  }

  public setItem(key: string, value: string): void {
    this._storage.setItem(`${this._keyPrefix}${key}`, value);
  }

  public getStorageEventKey(logicalKey: string): string {
    return `${this._keyPrefix}${logicalKey}`;
  }
}
