export interface SoftNavigationSignalEntry {
  kind: 'span' | 'log';
  id: string;
  startEpochMillis: number;
}

export interface SoftNavigationSignalBufferArgs {
  maxAgeMillis?: number;
  maxEntries?: number;
}

export interface SoftNavigationWindowResult {
  spanIds: string[];
  logIds: string[];
}

const DEFAULT_MAX_AGE_MILLIS = 60_000;
const DEFAULT_MAX_ENTRIES = 4096;

/**
 * A bounded, in-memory rolling buffer of span and log signals. Used to back-fill
 * a soft-navigation span with the ids of signals that started within its window,
 * since that span is built after its window has already closed.
 */
export class SoftNavigationSignalBuffer {
  private readonly _maxAgeMillis: number;
  private readonly _maxEntries: number;
  private readonly _entries: SoftNavigationSignalEntry[] = [];
  private _latestStartEpochMillis = 0;

  public constructor({
    maxAgeMillis = DEFAULT_MAX_AGE_MILLIS,
    maxEntries = DEFAULT_MAX_ENTRIES,
  }: SoftNavigationSignalBufferArgs = {}) {
    this._maxAgeMillis = maxAgeMillis;
    this._maxEntries = maxEntries;
  }

  public record(entry: SoftNavigationSignalEntry): void {
    this._entries.push(entry);
    if (entry.startEpochMillis > this._latestStartEpochMillis) {
      this._latestStartEpochMillis = entry.startEpochMillis;
    }
    this._evict();
  }

  public collectWindow(
    startEpochMillis: number,
    endEpochMillis: number,
  ): SoftNavigationWindowResult {
    const spanIds: string[] = [];
    const logIds: string[] = [];
    for (const entry of this._entries) {
      if (
        entry.startEpochMillis >= startEpochMillis &&
        entry.startEpochMillis <= endEpochMillis
      ) {
        if (entry.kind === 'span') {
          spanIds.push(entry.id);
        } else {
          logIds.push(entry.id);
        }
      }
    }
    return { spanIds, logIds };
  }

  // Age eviction is relative to the newest entry seen so the buffer needs no
  // injected clock and stays deterministic.
  private _evict(): void {
    const cutoff = this._latestStartEpochMillis - this._maxAgeMillis;
    while (
      this._entries.length > 0 &&
      this._entries[0].startEpochMillis < cutoff
    ) {
      this._entries.shift();
    }
    while (this._entries.length > this._maxEntries) {
      this._entries.shift();
    }
  }
}
