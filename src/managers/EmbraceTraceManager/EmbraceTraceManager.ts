import { trace, context } from '@opentelemetry/api';
import type {
  TraceManager,
  EmbraceExtendedSpan,
  EmbraceExtendedSpanOptions,
} from '../../api-traces/index.js';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import { EmbraceSpan } from './EmbraceSpan.js';

export class EmbraceTraceManager implements TraceManager {
  public startSpan(
    name: string,
    options: EmbraceExtendedSpanOptions = {}
  ): EmbraceExtendedSpan {
    const tracer = trace.getTracer('embrace-web-sdk-traces');

    options.attributes = options.attributes ? options.attributes : {};
    options.attributes[KEY_EMB_TYPE] = EMB_TYPES.Perf;

    const ctx = options.parentSpan
      ? trace.setSpan(context.active(), options.parentSpan)
      : undefined;

    return new EmbraceSpan(tracer.startSpan(name, options, ctx));
  }
}
