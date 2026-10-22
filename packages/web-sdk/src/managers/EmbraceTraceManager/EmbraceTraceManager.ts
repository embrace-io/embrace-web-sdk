import type { Context, Tracer } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import type {
  ExtendedSpan,
  ExtendedSpanOptions,
  TraceManager,
} from '../../api-traces/index.ts';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import { OTelPerformanceManager } from '../../utils/index.ts';
import { EmbraceExtendedSpan } from './EmbraceExtendedSpan.ts';
import type { EmbraceTraceManagerArgs } from './types.ts';

export class EmbraceTraceManager implements TraceManager {
  private readonly _tracer: Tracer;
  private readonly _perf: PerformanceManager;

  public constructor({
    tracerProvider: globalTraceProviderOverride,
    perf = new OTelPerformanceManager(),
  }: EmbraceTraceManagerArgs = {}) {
    const tracerProvider = globalTraceProviderOverride ?? trace;

    this._tracer = tracerProvider.getTracer('embrace-web-sdk-traces');
    this._perf = perf;
  }

  public startSpan(
    name: string,
    options: ExtendedSpanOptions = {},
    ctx?: Context,
  ): ExtendedSpan {
    options.attributes = options.attributes ? options.attributes : {};
    options.attributes[KEY_EMB_TYPE] = EMB_TYPES.Perf;

    const activeContext = options.parentSpan
      ? trace.setSpan(context.active(), options.parentSpan)
      : ctx;

    // Without a start time, OTel times the span's end and events as start + elapsed
    // performance.now(), which leaves out any time asleep.
    return new EmbraceExtendedSpan(
      this._tracer.startSpan(
        name,
        { ...options, startTime: options.startTime ?? this._perf.getNow() },
        activeContext,
      ),
      this._perf,
    );
  }

  public setSpan: TraceManager['setSpan'] = trace.setSpan;

  public getSpan(context: Context): ExtendedSpan | undefined {
    const span = trace.getSpan(context);

    if (span) {
      return new EmbraceExtendedSpan(span, this._perf);
    }

    return undefined;
  }
}
