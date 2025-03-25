import { diag, type DiagLogger, type Span } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import {
  OTelPerformanceManager,
  type PerformanceManager
} from '../../utils/index.js';
import type { EmbraceProcessorArgs } from './types.js';

export abstract class EmbraceProcessor implements SpanProcessor {
  private readonly _perf: PerformanceManager;
  private readonly _diag: DiagLogger;
  private readonly _processorName: string;

  protected constructor({
    diag: providedDiag,
    perf,
    processorName
  }: EmbraceProcessorArgs) {
    this._processorName = processorName;
    this._diag =
      providedDiag ??
      diag.createComponentLogger({
        namespace: processorName
      });
    this._perf = perf ?? new OTelPerformanceManager();
  }

  /* Returns the performance manager */
  protected get perf(): PerformanceManager {
    return this._perf;
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
