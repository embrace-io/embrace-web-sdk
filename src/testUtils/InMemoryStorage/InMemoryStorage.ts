export class InMemoryStorage implements Storage {
  private readonly _items: Record<string, string> = {};

  public get length() {
    return Object.keys(this._items).length;
  }

  public clear(): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    Object.keys(this._items).forEach(key => delete this._items[key]);
  }

  public getItem(key: string): string | null {
    return this._items[key];
  }

  public key(index: number): string | null {
    return Object.keys(this._items)[index];
  }

  public removeItem(key: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this._items[key];
  }

  public setItem(key: string, value: string): void {
    this._items[key] = value;
  }
}
