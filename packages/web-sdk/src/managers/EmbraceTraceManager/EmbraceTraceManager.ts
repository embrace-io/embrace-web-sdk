import type { Context, Tracer } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import type {
  ExtendedSpan,
  ExtendedSpanOptions,
  TraceManager,
} from '../../api-traces/index.ts';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import type { UserSessionManagerInternal } from '../EmbraceUserSessionManager/index.ts';
import { EmbraceExtendedSpan } from './EmbraceExtendedSpan.ts';
import type { EmbraceTraceManagerArgs } from './types.ts';

export class EmbraceTraceManager implements TraceManager {
  private readonly _tracer: Tracer;
  private readonly _userSessionManager: UserSessionManagerInternal | null;

  public constructor({
    tracerProvider: globalTraceProviderOverride,
    userSessionManager,
  }: EmbraceTraceManagerArgs = {}) {
    const tracerProvider = globalTraceProviderOverride ?? trace;

    this._tracer = tracerProvider.getTracer('embrace-web-sdk-traces');
    this._userSessionManager = userSessionManager ?? null;
  }

  public startSpan(
    name: string,
    options: ExtendedSpanOptions = {},
    ctx?: Context,
  ): ExtendedSpan {
    options.attributes = options.attributes ? options.attributes : {};
    options.attributes[KEY_EMB_TYPE] = EMB_TYPES.Perf;

    // Default parent is the active session-part span so customer-created
    // spans are correlated under the part in the trace tree. Explicit
    // parentSpan / context still take precedence so callers can override.
    let activeContext: Context | undefined;
    if (options.parentSpan) {
      activeContext = trace.setSpan(context.active(), options.parentSpan);
    } else if (ctx) {
      activeContext = ctx;
    } else {
      const partSpan = this._userSessionManager?.getSessionPartSpan();
      if (partSpan) {
        activeContext = trace.setSpan(context.active(), partSpan);
      }
    }

    return new EmbraceExtendedSpan(
      this._tracer.startSpan(name, options, activeContext),
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
