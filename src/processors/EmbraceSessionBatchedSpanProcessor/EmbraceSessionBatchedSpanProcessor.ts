import type { ExportResult } from '@opentelemetry/core';
import {
  BindOnceFuture,
  ExportResultCode,
  internal,
} from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-web'; // TODO: don't rely on internal API
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import type { SessionSpan } from '../../instrumentations/index.js';
import { EmbraceProcessor } from '../EmbraceProcessor/index.js';
import type { EmbraceSessionBatchedSpanProcessorArgs } from './types.js';
import type { LimitManagerInternal } from '../../managers/index.js';

const isSessionSpan = (span: ReadableSpan | SessionSpan): span is SessionSpan =>
  span.attributes[KEY_EMB_TYPE] === EMB_TYPES.Session;

const PENDING_SPANS_STORAGE_KEY_PREFIX = 'embrace_pending_';
const STORED_SPANS_EXPIRE_TIMEOUT_MS: number = 60 * 60 * 1000; // 1 hour

export class EmbraceSessionBatchedSpanProcessor extends EmbraceProcessor {
  private readonly _shutdownOnce: BindOnceFuture<void>;
  private _pendingSpans: ReadableSpan[] = [];
  private readonly _exporter: SpanExporter;
  private readonly _limitManager: LimitManagerInternal;
  private readonly _storage: Storage;
  private _checkExpiredSpansInterval?: ReturnType<typeof setInterval>;

  public constructor({
    exporter,
    limitManager,
    storage = window.localStorage,
    ...parentArgs
  }: EmbraceSessionBatchedSpanProcessorArgs) {
    super({
      ...parentArgs,
      processorName: 'EmbraceSessionBatchedSpanProcessor',
    });
    this._exporter = exporter;
    this._shutdownOnce = new BindOnceFuture(this._shutdown, this);
    this._limitManager = limitManager;
    this._storage = storage;
    this._startExpiredSpansCheck();
  }

  public override forceFlush(): Promise<void> {
    this.diag.debug(
      'forceFlush called for EmbraceSessionBatchedSpanProcessor. This is a no op'
    );
    return Promise.resolve(undefined);
  }

  public onEnd(span: ReadableSpan): void {
    if (this._shutdownOnce.isCalled) {
      this.diag.debug('span ended after processor shutdown. Ignoring span.');
      return;
    }

    if (!isSessionSpan(span)) {
      this.diag.debug('non-session span ended. Adding to pending spans queue.');
      if (this._limitManager.dropReadableSpan(span)) {
        return;
      }
      this._pendingSpans.push(span);
    } else {
      this.diag.debug('session span ended. Exporting all pending spans.');
      this._exportSpans([span, ...this._pendingSpans]);
      this._pendingSpans = [];
    }
  }

  private _exportSpans(spans: ReadableSpan[]): void {
    internal
      ._export(this._exporter, spans)
      .then((result: ExportResult) => {
        if (result.code === ExportResultCode.FAILED) {
          this.diag.error(
            `spans failed to export: ${result.error?.message || 'unknown error'}`
          );
        }
      })
      // Seems like everything related to the export logic does a good job of catching and only ever resolving with
      // an ExportResult even on failure: https://github.com/open-telemetry/opentelemetry-js/blob/cf6dffeebcf72c42b2cb4d2bf2db720369b53081/packages/opentelemetry-core/src/internal/exporter.ts#L37
      // Keep this block just in case that assumption changes in a future version
      .catch((reason: unknown) => {
        let msg = 'unknown error';
        if (reason && reason instanceof Error) {
          msg = reason.message;
        } else if (typeof reason === 'string') {
          msg = reason;
        }

        this.diag.error(`spans failed to export: ${msg}`);
      });
  }

  public override onStart(): void {
    // do nothing.
  }

  public override getPendingSpansCount(): number {
    return this._pendingSpans.length;
  }

  public override storePendingSpans(
    sessionId: string,
    sessionSpan: ReadableSpan
  ): void {
    try {
      const key = `${PENDING_SPANS_STORAGE_KEY_PREFIX}${sessionId}_${Date.now()}`;
      this._storage.setItem(
        key,
        JSON.stringify([sessionSpan, ...this._pendingSpans])
      );
    } catch (error) {
      this.diag.error('Failed to store spans to storage:', error);
    }
  }

  public clearStoredSpans(sessionId: string): void {
    try {
      for (let i = 0; i < this._storage.length; i++) {
        const key = this._storage.key(i);
        if (
          key &&
          key.startsWith(`${PENDING_SPANS_STORAGE_KEY_PREFIX}${sessionId}_`)
        ) {
          this._storage.removeItem(key);
        }
      }
    } catch (error) {
      this.diag.error('Failed to clear stored spans from storage:', error);
    }
  }

  private _startExpiredSpansCheck(): void {
    this._checkExpiredSpansInterval = setInterval(() => {
      this._checkAndExportExpiredSpans();
    }, 60 * 1000); // Check every minute
  }

  private _checkAndExportExpiredSpans(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < this._storage.length; i++) {
        const key = this._storage.key(i);
        if (key && key.startsWith(PENDING_SPANS_STORAGE_KEY_PREFIX)) {
          keys.push(key);
        }
      }
      const currentTime = Date.now();

      keys.forEach(key => {
        const parts = key.split('_');
        const storedTime = parseInt(parts[parts.length - 1], 10);

        if (
          isNaN(storedTime) ||
          currentTime - storedTime <= STORED_SPANS_EXPIRE_TIMEOUT_MS
        ) {
          return;
        }

        const storedData = this._storage.getItem(key);
        const parsedSpans = JSON.parse(<string>storedData) as ReadableSpan[];
        this._exportSpans(parsedSpans);
        this._storage.removeItem(key);
      });
    } catch (error) {
      this.diag.error('Failed to check and export expired spans:', error);
    }
  }

  public shutdown(): Promise<void> {
    return this._shutdownOnce.call();
  }

  private readonly _shutdown = () => {
    if (this._checkExpiredSpansInterval) {
      clearInterval(this._checkExpiredSpansInterval);
    }
    return this._exporter.shutdown();
  };
}
