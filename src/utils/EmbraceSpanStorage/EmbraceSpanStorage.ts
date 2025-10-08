import type { DiagLogger, Tracer } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-web';
import { emptyResource } from '@opentelemetry/resources';
import type { Resource } from '@opentelemetry/resources';

const PENDING_SPANS_STORAGE_KEY_PREFIX = 'embrace_pending_';
const MAX_PENDING_SPANS_ITEMS = 10;

export interface SpanStorageOptions {
  resource?: Resource;
  storage?: Storage;
  diag?: DiagLogger;
  storedSpansExpireTimeoutMS?: number;
  onExpiredSpansExport?: (spans: ReadableSpan[]) => void;
}

// EmbraceSpanStorage is used to keep pending spans that are not meant to be exported (yet) in localStorage,
// and periodically checks whenever those stored spans are ready to be exported.
// This functionality has some custom logic to be able to store these spans as JSONs and then recreate them back
// that could eventually be improved. In particular the things that would need to be improved are:
// - Avoid serializing as JSON and instead try to use a customExporter that produces the body as it was going to be
//   sent over the wire (serialized, compressed, etc), and store that, so that later when it decides to export those,
//   it's just using that body as a regular fetch call.
// - Create a service worker that is responsible for tracking the pending spans and deciding when to actually export them.
//   That way we would avoid a potential race condition where two different tabs would try to export the same data.
// - Make this a more comprehensive component so that the EmbraceSessionBatchedSpanProcessor doesn't need to be in the
//   middle of SpanSessionVisibilityInstrumentation and this component. Ideally this component would know when and how
//   to take snapshots of the current pending spans and the current session span at any moment, so that the visibility
//   instrumentation doesn't need to be telling that to the batch span processor.
export class EmbraceSpanStorage {
  private readonly _noExportTracer: Tracer;
  private readonly _storage: Storage;
  private readonly _diag: DiagLogger;
  private readonly _onExpiredSpansExport?: (spans: ReadableSpan[]) => void;
  private readonly _storedSpansExpireTimeoutMS: number;
  private _checkExpiredSpansInterval?: ReturnType<typeof setInterval>;

  public constructor({
    resource = emptyResource(),
    storage = window.localStorage,
    diag: diagParam = diag.createComponentLogger({
      namespace: 'EmbraceSpanStorage',
    }),
    storedSpansExpireTimeoutMS = 60 * 60 * 1000, // 1 hour
    onExpiredSpansExport,
  }: SpanStorageOptions = {}) {
    this._noExportTracer = new BasicTracerProvider({ resource }).getTracer(
      'embrace-web-sdk-sessions'
    );
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

      if (this._getPendingSpansKeys().length >= MAX_PENDING_SPANS_ITEMS) {
        this._diag.warn(
          'Not storing pending spans as the max number of items was reached'
        );
        return;
      }

      const key = `${PENDING_SPANS_STORAGE_KEY_PREFIX}${sessionId}_${Date.now()}`;
      this._storage.setItem(
        key,
        JSON.stringify([sessionSpan, ...pendingSpans], (key, value) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          key.startsWith('_') ? undefined : value
        )
      );

      this._diag.debug(`Stored pending span: ${key}`);
    } catch (error) {
      this._diag.error('Failed to store spans to storage:', error);
    }
  }

  public clearStoredSpans(sessionId: string): void {
    try {
      const prefix = `${PENDING_SPANS_STORAGE_KEY_PREFIX}${sessionId}_`;
      this._getPendingSpansKeys().forEach(key => {
        if (key.startsWith(prefix)) {
          this._storage.removeItem(key);
        }
      });
    } catch (error) {
      this._diag.error('Failed to clear stored spans from storage:', error);
    }
  }

  public startExpiredSpansCheck(): void {
    this._checkExpiredSpansInterval = setInterval(
      () => {
        this.checkAndExportExpiredSpans();
      },
      5 * 60 * 1000
    ); // Check every 5 minutes
  }

  public stopExpiredSpansCheck(): void {
    if (this._checkExpiredSpansInterval) {
      clearInterval(this._checkExpiredSpansInterval);
      this._checkExpiredSpansInterval = undefined;
    }
  }

  public checkAndExportExpiredSpans(): void {
    try {
      const keys = this._getPendingSpansKeys();
      if (keys.length === 0) {
        return;
      }

      const currentTime = Date.now();
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
            const span = this._noExportTracer.startSpan(storedSpan.name, {
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

  public _getPendingSpansKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this._storage.length; i++) {
      const key = this._storage.key(i);
      if (key && key.startsWith(PENDING_SPANS_STORAGE_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    return keys;
  }

  public destroy(): void {
    this.stopExpiredSpansCheck();
  }
}
