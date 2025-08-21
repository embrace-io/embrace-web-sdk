import type { DiagLogger, Span } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import type { EmbraceProcessorArgs } from './types.js';

export abstract class EmbraceProcessor implements SpanProcessor {
  private readonly _diag: DiagLogger;
  private readonly _processorName: string;

  protected constructor({
    diag: providedDiag,
    processorName,
  }: EmbraceProcessorArgs) {
    this._processorName = processorName;
    this._diag =
      providedDiag ??
      diag.createComponentLogger({
        namespace: processorName,
      });
  }

  /* Returns the diag logger */
  protected get diag(): DiagLogger {
    return this._diag;
  }

  /* Returns the processor name */
  protected get processorName(): string {
    return this._processorName;
  }

  public abstract forceFlush(): Promise<void>;

  public abstract onEnd(span: ReadableSpan): void;

  public abstract onStart(span: Span): void;

  /**
   * Returns the number of spans currently pending export.
   *
   * @returns The number of pending spans in the internal queue
   */
  public abstract getPendingSpansCount(): number;

  /**
   * Serializes and stores the current pending spans to storage for persistence.
   * It also includes the sessionSpan passed as parameter to be included in the storage.
   *
   * These spans can later be either cleared out by using clearStoredSpans()
   * or they will eventually be exported after certain time passes
   *
   * @param sessionId - The session ID to associate with the stored spans.
   * @param sessionSpan - The session span to be included in the stored spans.
   */
  public abstract storePendingSpans(sessionId: string, sessionSpan: Span): void;

  /**
   * Removes all stored spans for a specific session from storage.
   *
   * This should be used to continue a session, and follow the regular export process.
   *
   * @param sessionId - The session ID whose stored spans should be cleared
   */
  public abstract clearStoredSpans(sessionId: string): void;

  public abstract shutdown(): Promise<void>;
}
