import type { DiagLogger } from '@opentelemetry/api';
import type { NamespacedStorage } from '../../../utils/index.ts';
import { EMBRACE_PERMANENT_PROPERTIES_KEY } from '../constants.ts';

export interface PermanentPropertiesStoreArgs {
  storage: NamespacedStorage;
  diag: DiagLogger;
}

/**
 * Permanent properties, keyed without the `emb.properties.` prefix, shared by
 * every tab and kept across user sessions. Each read goes to storage, so a tab
 * sees what other tabs wrote.
 */
export class PermanentPropertiesStore {
  private readonly _storage: NamespacedStorage;
  private readonly _diag: DiagLogger;

  public constructor({ storage, diag }: PermanentPropertiesStoreArgs) {
    this._storage = storage;
    this._diag = diag;
  }

  public read(): Record<string, string> {
    const raw = this._storage.getItem(EMBRACE_PERMANENT_PROPERTIES_KEY);

    if (!raw) {
      return {};
    }

    const properties = this._parse(raw);

    if (properties === null) {
      this._storage.removeItem(EMBRACE_PERMANENT_PROPERTIES_KEY);

      return {};
    }

    return properties;
  }

  /**
   * Removes the stored value once no properties are left, so storage stays
   * tidy. Returns false when the properties didn't reach storage; callers gate
   * cross-scope flips on this so a failed permanent write doesn't strip the
   * previously-visible user-session-scoped value.
   */
  public write(properties: Record<string, string>): boolean {
    if (Object.keys(properties).length === 0) {
      return this._storage.removeItem(EMBRACE_PERMANENT_PROPERTIES_KEY);
    }

    return this._storage.setItem(
      EMBRACE_PERMANENT_PROPERTIES_KEY,
      JSON.stringify(properties),
    );
  }

  // Returns null, after logging, when the stored value isn't a plain object.
  // Entries whose value isn't a string are dropped.
  private _parse(raw: string): Record<string, string> | null {
    try {
      const parsed = JSON.parse(raw) as unknown;

      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        throw new Error('permanent properties blob is not a plain object');
      }

      const properties: Record<string, string> = {};

      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          properties[key] = value;
        }
      }

      return properties;
    } catch (e) {
      this._diag.error(
        'Permanent properties in storage are corrupt; discarding',
        e,
      );

      return null;
    }
  }
}
