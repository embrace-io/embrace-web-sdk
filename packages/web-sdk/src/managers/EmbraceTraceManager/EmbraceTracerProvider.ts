import type { Context, Span, SpanOptions, Tracer } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import type { PerformanceManager } from '../../utils/index.ts';
import { EmbraceExtendedSpan } from './EmbraceExtendedSpan.ts';
import type { EmbraceTracerProviderArgs } from './types.ts';

/**
 * A TracerProvider whose tracers keep span times on the wall clock across a sleep. Spans are started
 * through `EmbraceExtendedSpan.start`, which converts the times given to them.
 */
export class EmbraceTracerProvider extends TracerProvider {
  private readonly _perf: PerformanceManager;

  public constructor({ perf, ...options }: EmbraceTracerProviderArgs) {
    super(options);
    this._perf = perf;
  }

  public override getTracer(
    name: string,
    version?: string,
    options?: { schemaUrl?: string },
  ): Tracer {
    return new EmbraceTracer(
      super.getTracer(name, version, options),
      this._perf,
    );
  }
}

class EmbraceTracer implements Tracer {
  private readonly _tracer: Tracer;
  private readonly _perf: PerformanceManager;

  public constructor(tracer: Tracer, perf: PerformanceManager) {
    this._tracer = tracer;
    this._perf = perf;
  }

  public startSpan(
    name: string,
    options: SpanOptions = {},
    ctx?: Context,
  ): Span {
    return EmbraceExtendedSpan.start(
      this._tracer,
      this._perf,
      name,
      options,
      ctx,
    );
  }

  public startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    ...args: [F] | [SpanOptions, F] | [SpanOptions, Context, F]
  ): ReturnType<F> {
    // As the SDK tracer does, but through this.startSpan, so the EmbraceExtendedSpan is the active span
    const fn = args[args.length - 1] as F;
    const options = args.length > 1 ? (args[0] as SpanOptions) : {};
    const parentContext =
      args.length > 2 ? (args[1] as Context) : context.active();
    const span = this.startSpan(name, options, parentContext);

    return context.with(trace.setSpan(parentContext, span), () =>
      fn(span),
    ) as ReturnType<F>;
  }
}
