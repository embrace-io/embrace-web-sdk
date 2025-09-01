import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-web';

const PENDING_SPANS_STORAGE_KEY_PREFIX = 'embrace_pending_';

export interface SpanStorageOptions {
  storage?: Storage;
  diag?: DiagLogger;
  storedSpansExpireTimeoutMS?: number;
  onExpiredSpansExport?: (spans: ReadableSpan[]) => void;
}

export class EmbraceSpanStorage {
  private readonly _storage: Storage;
  private readonly _diag: DiagLogger;
  private readonly _onExpiredSpansExport?: (spans: ReadableSpan[]) => void;
  private readonly _storedSpansExpireTimeoutMS: number;
  private _checkExpiredSpansInterval?: ReturnType<typeof setInterval>;

  public constructor({
    storage = window.localStorage,
    diag: diagParam = diag.createComponentLogger({
      namespace: 'EmbraceSpanStorage',
    }),
    storedSpansExpireTimeoutMS = 60 * 60 * 1000, // 1 hour
    onExpiredSpansExport,
  }: SpanStorageOptions = {}) {
    this._storage = storage;
    this._diag = diagParam;
    this._storedSpansExpireTimeoutMS = storedSpansExpireTimeoutMS;
    this._onExpiredSpansExport = onExpiredSpansExport;

    this.startExpiredSpansCheck();
  }

  public storePendingSpans(
    sessionId: string,
    sessionSpan: ReadableSpan,
    pendingSpans: ReadableSpan[]
  ): void {
    try {
      // If this session was already stored, clear it first:
      this.clearStoredSpans(sessionId);

      const key = `${PENDING_SPANS_STORAGE_KEY_PREFIX}${sessionId}_${Date.now()}`;
      this._storage.setItem(
        key,
        JSON.stringify([sessionSpan, ...pendingSpans], (key, value) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          key.startsWith('_') ? undefined : value
        )
      );
    } catch (error) {
      this._diag.error('Failed to store spans to storage:', error);
    }
  }

  public clearStoredSpans(sessionId: string): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < this._storage.length; i++) {
        const key = this._storage.key(i);
        if (
          key &&
          key.startsWith(`${PENDING_SPANS_STORAGE_KEY_PREFIX}${sessionId}_`)
        ) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        this._storage.removeItem(key);
      });
    } catch (error) {
      this._diag.error('Failed to clear stored spans from storage:', error);
    }
  }

  public startExpiredSpansCheck(): void {
    this._checkExpiredSpansInterval = setInterval(() => {
      this.checkAndExportExpiredSpans();
    }, 60 * 1000); // Check every minute
  }

  public stopExpiredSpansCheck(): void {
    if (this._checkExpiredSpansInterval) {
      clearInterval(this._checkExpiredSpansInterval);
      this._checkExpiredSpansInterval = undefined;
    }
  }

  public checkAndExportExpiredSpans(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < this._storage.length; i++) {
        const key = this._storage.key(i);
        if (key && key.startsWith(PENDING_SPANS_STORAGE_KEY_PREFIX)) {
          keys.push(key);
        }
      }

      if (keys.length === 0) {
        return;
      }

      const currentTime = Date.now();
      const tracer = new BasicTracerProvider().getTracer(
        'embrace-web-sdk-sessions'
      );
      keys.forEach(key => {
        const parts = key.split('_');
        const storedTime = parseInt(parts[parts.length - 1], 10);

        if (isNaN(storedTime)) {
          this._diag.error(
            'Found invalid timestamp in stored span:',
            storedTime
          );
          this._storage.removeItem(key);
        }

        if (currentTime - storedTime <= this._storedSpansExpireTimeoutMS) {
          return;
        }

        const storedData = this._storage.getItem(key);
        if (!storedData) return;

        try {
          const spans: ReadableSpan[] = [];
          for (const storedSpan of JSON.parse(storedData) as ReadableSpan[]) {
            const span = tracer.startSpan(storedSpan.name, {
              kind: storedSpan.kind,
              attributes: storedSpan.attributes,
              links: storedSpan.links,
              startTime: storedSpan.startTime,
            });
            span.setStatus(storedSpan.status);
            span.end(storedSpan.endTime);
            spans.push(span as unknown as ReadableSpan);
          }

          if (this._onExpiredSpansExport && spans.length > 0) {
            this._onExpiredSpansExport(spans);
          }
        } catch (e) {
          this._diag.error('Failed to process expired spans:', e);
        }

        // Always remove the storage item even if processing failed
        this._storage.removeItem(key);
      });
    } catch (e) {
      this._diag.error('Failed to check and export expired spans:', e);
    }
  }

  public destroy(): void {
    this.stopExpiredSpansCheck();
  }
}
