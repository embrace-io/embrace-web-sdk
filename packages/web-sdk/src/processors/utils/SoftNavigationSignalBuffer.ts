export interface SoftNavigationSignalEntry {
  readonly kind: 'span' | 'log';
  readonly id: string;
  readonly startTime: number;
}

export interface SoftNavigationSignalBufferArgs {
  maxAgeMillis?: number;
  maxEntries?: number;
}

export interface SoftNavigationWindowResult {
  spanIds: string[];
  logIds: string[];
}

// Best-effort correlation ceiling: a soft-navigation span whose window is
// still open 60s after the newest recorded signal will under-report early
// signals, since those signals have already been evicted by then.
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
  private _latestStartTime = 0;

  public constructor({
    maxAgeMillis = DEFAULT_MAX_AGE_MILLIS,
    maxEntries = DEFAULT_MAX_ENTRIES,
  }: SoftNavigationSignalBufferArgs = {}) {
    this._maxAgeMillis = maxAgeMillis;
    this._maxEntries = maxEntries;
  }

  public record(entry: SoftNavigationSignalEntry): void {
    this._entries.push(entry);
    if (entry.startTime > this._latestStartTime) {
      this._latestStartTime = entry.startTime;
    }
    this._evict();
  }

  public collectWindow(
    startTime: number,
    endTime: number,
  ): SoftNavigationWindowResult {
    const spanIds: string[] = [];
    const logIds: string[] = [];
    for (const entry of this._entries) {
      if (entry.startTime >= startTime && entry.startTime <= endTime) {
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
    const cutoff = this._latestStartTime - this._maxAgeMillis;
    while (this._entries.length > 0 && this._entries[0].startTime < cutoff) {
      this._entries.shift();
    }
    while (this._entries.length > this._maxEntries) {
      this._entries.shift();
    }
  }
}
