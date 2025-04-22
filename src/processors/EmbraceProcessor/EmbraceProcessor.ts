import { diag, type DiagLogger, type Span } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import { session, type SpanSessionManager } from '../../api-sessions/index.js';
import type { EmbraceProcessorArgs } from './types.js';

export abstract class EmbraceProcessor implements SpanProcessor {
  private readonly _diag: DiagLogger;
  private readonly _processorName: string;
  private readonly _sessionManager: SpanSessionManager;

  protected constructor({
    diag: providedDiag,
    processorName,
    spanSessionManager,
  }: EmbraceProcessorArgs) {
    this._processorName = processorName;
    this._diag =
      providedDiag ??
      diag.createComponentLogger({
        namespace: processorName,
      });
    this._sessionManager =
      spanSessionManager ?? session.getSpanSessionManager();
  }

  /* Returns the diag logger */
  protected get diag(): DiagLogger {
    return this._diag;
  }

  /* Returns the processor name */
  protected get processorName(): string {
    return this._processorName;
  }

  /* Returns session provider */
  protected get sessionManager(): SpanSessionManager {
    return this._sessionManager;
  }

  public abstract forceFlush(): Promise<void>;

  public abstract onEnd(span: ReadableSpan): void;

  public abstract onStart(span: Span): void;

  public abstract shutdown(): Promise<void>;
}
