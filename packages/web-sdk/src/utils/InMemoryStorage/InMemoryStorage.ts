// Stands in for a storage area the page can't access, keeping state for the
// page's lifetime.
export class InMemoryStorage implements Storage {
  private readonly _items = new Map<string, string>();

  public get length(): number {
    return this._items.size;
  }

  public clear(): void {
    this._items.clear();
  }

  public getItem(key: string): string | null {
    return this._items.get(key) ?? null;
  }

  public key(index: number): string | null {
    return Array.from(this._items.keys())[index] ?? null;
  }

  public removeItem(key: string): void {
    this._items.delete(key);
  }

  public setItem(key: string, value: string): void {
    this._items.set(key, value);
  }
}
