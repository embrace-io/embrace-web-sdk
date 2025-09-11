export class NamespacedStorage implements Storage {
  private readonly _keyPrefix: string;
  private readonly _underlyingStorage: Storage;

  public constructor(namespace: string, underlyingStorage: Storage) {
    this._keyPrefix = `${namespace}_`;
    this._underlyingStorage = underlyingStorage;
  }

  protected getNamespacedKeys(): string[] {
    const keys = [];
    for (let i = 0; i < this._underlyingStorage.length; i++) {
      const key = this._underlyingStorage.key(i);
      if (key && key.startsWith(this._keyPrefix)) {
        keys.push(key.substring(this._keyPrefix.length));
      }
    }

    return keys;
  }

  public get length(): number {
    return this.getNamespacedKeys().length;
  }

  public clear(): void {
    this.getNamespacedKeys().forEach(key => {
      this._underlyingStorage.removeItem(`${this._keyPrefix}${key}`);
    });
  }

  public getItem(key: string): string | null {
    return this._underlyingStorage.getItem(`${this._keyPrefix}${key}`);
  }

  public key(index: number): string | null {
    return this.getNamespacedKeys()[index] || null;
  }

  public removeItem(key: string): void {
    this._underlyingStorage.removeItem(`${this._keyPrefix}${key}`);
  }

  public setItem(key: string, value: string): void {
    this._underlyingStorage.setItem(`${this._keyPrefix}${key}`, value);
  }
}
