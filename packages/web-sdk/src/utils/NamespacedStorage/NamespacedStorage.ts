export class NamespacedStorage implements Storage {
  private readonly _keyPrefix: string;
  private readonly _storage: Storage;

  public constructor(namespace: string, storage: Storage) {
    this._keyPrefix = `${namespace}_`;
    this._storage = storage;
  }

  protected getNamespacedKeys(): string[] {
    const keys = [];
    for (let i = 0; i < this._storage.length; i++) {
      const key = this._storage.key(i);
      if (key?.startsWith(this._keyPrefix)) {
        keys.push(key.substring(this._keyPrefix.length));
      }
    }

    return keys;
  }

  public get length(): number {
    return this.getNamespacedKeys().length;
  }

  public clear(): void {
    this.getNamespacedKeys().forEach((key) => {
      this._storage.removeItem(`${this._keyPrefix}${key}`);
    });
  }

  public getItem(key: string): string | null {
    return this._storage.getItem(`${this._keyPrefix}${key}`);
  }

  public key(index: number): string | null {
    return this.getNamespacedKeys()[index] || null;
  }

  public removeItem(key: string): void {
    this._storage.removeItem(`${this._keyPrefix}${key}`);
  }

  public setItem(key: string, value: string): void {
    this._storage.setItem(`${this._keyPrefix}${key}`, value);
  }

  /**
   * Returns the namespaced underlying-storage key for a logical key. Browser
   * `storage` events fire with the underlying key, so callers that filter
   * those events need to compare against this value rather than the logical
   * key. Plain `Storage` instances do not expose this method; callers should
   * fall back to the logical key in that case.
   */
  public getStorageEventKey(logicalKey: string): string {
    return `${this._keyPrefix}${logicalKey}`;
  }
}
