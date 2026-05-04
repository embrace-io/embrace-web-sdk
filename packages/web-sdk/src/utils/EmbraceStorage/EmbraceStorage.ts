import type { DiagLogger } from '@opentelemetry/api';

/**
 * `Storage`-shaped wrapper with safe error handling, an optional key
 * namespace, and cross-tab helpers. Mutation methods return `true` on
 * success and `false` when the call failed or writes have been disabled.
 * The first environmental write failure flips a sticky `writeDisabled`
 * flag and emits one error; subsequent `setItem` calls silently return
 * `false` without attempting the underlying write. A `TypeError` from
 * `setItem` propagates and does not disable writes.
 */
export class EmbraceStorage {
  private readonly _storage: Storage;
  private readonly _diag: DiagLogger;
  private readonly _keyPrefix: string;
  private _writeDisabled = false;

  public constructor(storage: Storage, diag: DiagLogger, namespace?: string) {
    this._storage = storage;
    this._diag = diag;
    this._keyPrefix = namespace ? `${namespace}_` : '';
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
      this._diag.warn(`Failed to read ${key} from storage`, e);
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
    if (this._writeDisabled) {
      return false;
    }
    try {
      this._storage.setItem(this._keyName(key), value);
      return true;
    } catch (e) {
      if (e instanceof TypeError) {
        throw e;
      }
      this._disableWrites(e instanceof Error ? e : String(e));
      return false;
    }
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
      this._diag.warn('Failed to read storage length', e);
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
          `Failed to read storage key at index ${i.toString()}`,
          e,
        );
      }
    }
    return result;
  }

  public isWriteDisabled(): boolean {
    return this._writeDisabled;
  }

  /**
   * Returns the underlying-storage key for a logical key. Browser `storage`
   * events fire with the underlying key, so callers that filter those events
   * need to compare against this value rather than the logical key.
   */
  public getStorageEventKey(logicalKey: string): string {
    return this._keyName(logicalKey);
  }

  private _keyName(key: string): string {
    return `${this._keyPrefix}${key}`;
  }

  private _safeRemove(keyName: string): boolean {
    try {
      this._storage.removeItem(keyName);
      return true;
    } catch (e) {
      this._diag.warn(`Failed to remove ${keyName} from storage`, e);
      return false;
    }
  }

  private _disableWrites(error: Error | string): void {
    if (this._writeDisabled) {
      return;
    }
    this._writeDisabled = true;
    this._diag.error(
      'Storage write failed; falling back to in-memory mode (cross-tab continuity disabled)',
      error,
    );
  }
}
