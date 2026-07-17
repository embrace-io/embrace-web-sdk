export interface SignalEntry {
  readonly kind: 'span' | 'log';
  readonly id: string;
  readonly startTime: number;
  // The signal's emb.type, e.g. EMB_TYPES.Network - tells the backend which
  // table to look the id up in. Undefined if the signal has no type at the
  // point it's recorded (e.g. some spans settle their type only later).
  readonly type?: string;
}

export interface SignalBufferArgs {
  maxAgeMillis?: number;
  maxEntries?: number;
}

export interface SignalWindowResult {
  spanIds: string[];
  spanTypes: string[];
  logIds: string[];
  logTypes: string[];
}

// Best-effort correlation ceiling: a window still open 60s after the newest
// recorded signal will under-report early signals, since those signals have
// already been evicted by then.
const DEFAULT_MAX_AGE_MILLIS = 60_000;
const DEFAULT_MAX_ENTRIES = 4096;

/**
 * A bounded, in-memory rolling buffer of span and log signals. Used to back-fill
 * a span with the ids of signals that started within its window, since that
 * span is built after its window has already closed.
 */
export class SignalBuffer {
  private readonly _maxAgeMillis: number;
  private readonly _maxEntries: number;
  private readonly _entries: SignalEntry[] = [];
  private _latestStartTime = 0;

  public constructor({
    maxAgeMillis = DEFAULT_MAX_AGE_MILLIS,
    maxEntries = DEFAULT_MAX_ENTRIES,
  }: SignalBufferArgs = {}) {
    this._maxAgeMillis = maxAgeMillis;
    this._maxEntries = maxEntries;
  }

  public record(entry: SignalEntry): void {
    this._entries.push(entry);
    if (entry.startTime > this._latestStartTime) {
      this._latestStartTime = entry.startTime;
    }
    this._evict();
  }

  public collectWindow(startTime: number, endTime: number): SignalWindowResult {
    const spanIds: string[] = [];
    const spanTypes: string[] = [];
    const logIds: string[] = [];
    const logTypes: string[] = [];
    for (const entry of this._entries) {
      if (entry.startTime >= startTime && entry.startTime <= endTime) {
        if (entry.kind === 'span') {
          spanIds.push(entry.id);
          spanTypes.push(entry.type ?? '');
        } else {
          logIds.push(entry.id);
          logTypes.push(entry.type ?? '');
        }
      }
    }
    return { spanIds, spanTypes, logIds, logTypes };
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
