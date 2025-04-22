import {
  diag,
  type DiagLogger,
  type Span,
  type SpanOptions,
  trace,
} from '@opentelemetry/api';
import type {
  TraceManager,
  PerformanceSpanFailedOptions,
} from '../../api-traces/index.js';
import {
  EMB_TYPES,
  KEY_EMB_ERROR_CODE,
  KEY_EMB_TYPE,
} from '../../constants/index.js';
import type { EmbraceTraceManagerArgs } from './types.js';

export class EmbraceTraceManager implements TraceManager {
  private readonly _diag: DiagLogger;

  public constructor({ diag: diagParam }: EmbraceTraceManagerArgs = {}) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceTraceManager',
      });
  }

  public startPerformanceSpan(name: string, options: SpanOptions = {}): Span {
    const tracer = trace.getTracer('embrace-web-sdk-traces');

    options.attributes = options.attributes ? options.attributes : {};
    options.attributes[KEY_EMB_TYPE] = EMB_TYPES.Perf;
    return tracer.startSpan(name, options);
  }

  public performanceSpanFailed(
    span: Span | null,
    options: PerformanceSpanFailedOptions = {
      code: 'failure',
    }
  ) {
    if (!span) {
      this._diag.debug(
        'performanceSpanFailed called with a null span. This is a no-op.'
      );
      return;
    }

    if (options.code) {
      span.setAttribute(KEY_EMB_ERROR_CODE, options.code.toUpperCase());
    }

    span.end(options.endTime);
  }
}
