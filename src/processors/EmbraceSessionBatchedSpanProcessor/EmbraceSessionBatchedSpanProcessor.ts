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
import type {
  LimitManagerInternal,
  SpanSessionManagerInternal,
} from '../../managers/index.js';
import { EmbraceSpanStorage } from '../../utils/index.js';

const isSessionSpan = (span: ReadableSpan | SessionSpan): span is SessionSpan =>
  span.attributes[KEY_EMB_TYPE] === EMB_TYPES.Session;

type ExportFailureReason = 'concurrent_limit' | 'fetch_error' | 'unknown';

const exportFailureAttributeKey = (
  reason: ExportFailureReason,
  session: 'current' | 'previous'
) =>
  `emb.${session === 'current' ? 'export_failed' : 'previous_export_failed'}.${reason}`;

export class EmbraceSessionBatchedSpanProcessor extends EmbraceProcessor {
  private readonly _shutdownOnce: BindOnceFuture<void>;
  private _pendingSpans: ReadableSpan[] = [];
  private readonly _exporter: SpanExporter;
  private readonly _limitManager: LimitManagerInternal;
  private readonly _spanStorage: EmbraceSpanStorage;
  private readonly _spanSessionManager: SpanSessionManagerInternal;

  public constructor({
    resource,
    exporter,
    limitManager,
    spanSessionManager,
    storage = window.localStorage,
    storedSpansExpireTimeoutMS,
    ...parentArgs
  }: EmbraceSessionBatchedSpanProcessorArgs) {
    super({
      ...parentArgs,
      processorName: 'EmbraceSessionBatchedSpanProcessor',
    });
    this._exporter = exporter;
    this._shutdownOnce = new BindOnceFuture(this._shutdown, this);
    this._limitManager = limitManager;
    this._spanSessionManager = spanSessionManager;
    this._spanStorage = new EmbraceSpanStorage({
      resource,
      storage,
      diag: parentArgs.diag,
      onExpiredSpansExport: (spans: ReadableSpan[]) => {
        this._exportSpans(spans);
      },
      storedSpansExpireTimeoutMS,
      spanSessionManager,
    });
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
          const errorMessage = result.error?.message || 'unknown error';
          let failureReason: ExportFailureReason = 'unknown';

          if (errorMessage === 'Concurrent export limit reached') {
            failureReason = 'concurrent_limit';
          } else if (errorMessage === 'Fetch request errored') {
            failureReason = 'fetch_error';
          }

          this._spanSessionManager.incrSessionCountForKey(
            exportFailureAttributeKey(failureReason, 'current')
          );
          this._spanSessionManager.incrNextSessionCountForKey(
            exportFailureAttributeKey(failureReason, 'previous')
          );
          this.diag.error(`spans failed to export: ${errorMessage}`);
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

        this._spanSessionManager.incrSessionCountForKey(
          exportFailureAttributeKey('unknown', 'current')
        );
        this._spanSessionManager.incrNextSessionCountForKey(
          exportFailureAttributeKey('unknown', 'previous')
        );
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
    this._spanStorage.storePendingSpans(
      sessionId,
      sessionSpan,
      this._pendingSpans
    );
  }

  public clearStoredSpans(sessionId: string): void {
    this._spanStorage.clearStoredSpans(sessionId);
  }

  public shutdown(): Promise<void> {
    return this._shutdownOnce.call();
  }

  private readonly _shutdown = () => {
    this._spanStorage.destroy();
    return this._exporter.shutdown();
  };
}
