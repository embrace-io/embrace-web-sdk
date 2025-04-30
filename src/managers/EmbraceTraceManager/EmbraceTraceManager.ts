import { type SpanOptions, trace } from '@opentelemetry/api';
import type { TraceManager, PerformanceSpan } from '../../api-traces/index.js';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import { EmbracePerformanceSpan } from './EmbracePerformanceSpan.js';

export class EmbraceTraceManager implements TraceManager {
  public startPerformanceSpan(
    name: string,
    options: SpanOptions = {}
  ): PerformanceSpan {
    const tracer = trace.getTracer('embrace-web-sdk-traces');

    options.attributes = options.attributes ? options.attributes : {};
    options.attributes[KEY_EMB_TYPE] = EMB_TYPES.Perf;
    return new EmbracePerformanceSpan(tracer.startSpan(name, options));
  }
}
