import type { Context, Tracer } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import type {
  ExtendedSpan,
  ExtendedSpanOptions,
  TraceManager,
  TraceManagerArgs,
} from '../../api-traces/index.js';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import { EmbraceExtendedSpan } from './EmbraceExtendedSpan.js';

export class EmbraceTraceManager implements TraceManager {
  private readonly _tracer: Tracer;

  public constructor({
    tracerProvider: globalTraceProviderOverride,
  }: TraceManagerArgs = {}) {
    const tracerProvider = globalTraceProviderOverride ?? trace;

    this._tracer = tracerProvider.getTracer('embrace-web-sdk-traces');
  }

  public startSpan(
    name: string,
    options: ExtendedSpanOptions = {},
    ctx?: Context
  ): ExtendedSpan {
    options.attributes = options.attributes ? options.attributes : {};
    options.attributes[KEY_EMB_TYPE] = EMB_TYPES.Perf;

    const activeContext = options.parentSpan
      ? trace.setSpan(context.active(), options.parentSpan)
      : ctx;

    return new EmbraceExtendedSpan(
      this._tracer.startSpan(name, options, activeContext)
    );
  }

  public setSpan: TraceManager['setSpan'] = trace.setSpan;

  public getSpan(context: Context): ExtendedSpan | undefined {
    const span = trace.getSpan(context);

    if (span) {
      return new EmbraceExtendedSpan(span);
    }

    return undefined;
  }
}
