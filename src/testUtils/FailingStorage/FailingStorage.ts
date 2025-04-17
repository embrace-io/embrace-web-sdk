export class FailingStorage implements Storage {
  public get length() {
    return 0;
  }

  public clear(): void {
    throw new Error('not implemented');
  }

  public getItem(_key: string): string | null {
    throw new Error('not implemented');
  }

  public key(_index: number): string | null {
    throw new Error('not implemented');
  }

  public removeItem(_key: string): void {
    throw new Error('not implemented');
  }

  public setItem(_key: string, _value: string): void {
    throw new Error('not implemented');
  }
}
