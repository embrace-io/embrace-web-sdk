import { diag, type DiagLogger, type Span } from '@opentelemetry/api';
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

  public abstract shutdown(): Promise<void>;
}
