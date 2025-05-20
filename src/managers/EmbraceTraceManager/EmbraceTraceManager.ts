import { trace, context } from '@opentelemetry/api';
import type {
  TraceManager,
  PerformanceSpan,
  PerformanceSpanOptions,
} from '../../api-traces/index.js';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import { EmbracePerformanceSpan } from './EmbracePerformanceSpan.js';

export class EmbraceTraceManager implements TraceManager {
  public startSpan(
    name: string,
    options: PerformanceSpanOptions = {}
  ): PerformanceSpan {
    const tracer = trace.getTracer('embrace-web-sdk-traces');

    options.attributes = options.attributes ? options.attributes : {};
    options.attributes[KEY_EMB_TYPE] = EMB_TYPES.Perf;

    const ctx = options.parentSpan
      ? trace.setSpan(context.active(), options.parentSpan)
      : undefined;

    return new EmbracePerformanceSpan(tracer.startSpan(name, options, ctx));
  }
}
