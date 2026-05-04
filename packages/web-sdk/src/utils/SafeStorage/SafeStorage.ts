import type { DiagLogger } from '@opentelemetry/api';
import { isNamespacedStorageLike } from '../NamespacedStorage/NamespacedStorage.ts';

// Centralizes try/catch around browser storage I/O. Returns sentinel
// values instead of throwing. The first write failure flips the wrapper
// into a disabled state and emits one error; subsequent writes are silent.
export interface SafeStorageLike {
  read(key: string): string | null;
  write(key: string, value: string): boolean;
  remove(key: string): boolean;
  has(key: string): boolean;
  keys(): string[];
  isDisabled(): boolean;
  getStorageEventKey(logicalKey: string): string;
}

export class SafeStorage implements SafeStorageLike {
  private readonly _storage: Storage;
  private readonly _diag: DiagLogger;
  private _disabled = false;

  public constructor(storage: Storage, diag: DiagLogger) {
    this._storage = storage;
    this._diag = diag;
  }

  public read(key: string): string | null {
    try {
      return this._storage.getItem(key);
    } catch (e) {
      this._diag.warn(`Failed to read ${key} from storage`, e);
      return null;
    }
  }

  public write(key: string, value: string): boolean {
    try {
      this._storage.setItem(key, value);
      return true;
    } catch (e) {
      this._disable(e);
      return false;
    }
  }

  public remove(key: string): boolean {
    try {
      this._storage.removeItem(key);
      return true;
    } catch (e) {
      this._diag.warn(`Failed to remove ${key} from storage`, e);
      return false;
    }
  }

  public has(key: string): boolean {
    return this.read(key) !== null;
  }

  public keys(): string[] {
    if (isNamespacedStorageLike(this._storage)) {
      try {
        return this._storage.keys();
      } catch (e) {
        this._diag.warn('Failed to read storage keys', e);
        return [];
      }
    }
    let length: number;
    try {
      length = this._storage.length;
    } catch (e) {
      this._diag.warn('Failed to read storage length', e);
      return [];
    }
    const result: string[] = [];
    for (let i = 0; i < length; i++) {
      try {
        const key = this._storage.key(i);
        if (key !== null) {
          result.push(key);
        }
      } catch (e) {
        this._diag.warn(
          `Failed to read storage key at index ${i.toString()}`,
          e,
        );
      }
    }
    return result;
  }

  public isDisabled(): boolean {
    return this._disabled;
  }

  public getStorageEventKey(logicalKey: string): string {
    return isNamespacedStorageLike(this._storage)
      ? this._storage.getStorageEventKey(logicalKey)
      : logicalKey;
  }

  private _disable(error: unknown): void {
    if (this._disabled) {
      return;
    }
    this._disabled = true;
    this._diag.error(
      'Storage write failed; falling back to in-memory mode (cross-tab continuity disabled)',
      error,
    );
  }
}
