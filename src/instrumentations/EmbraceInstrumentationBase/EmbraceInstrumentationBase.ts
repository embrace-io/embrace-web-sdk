import type {
  InstrumentationConfig,
  InstrumentationModuleDefinition,
} from '@opentelemetry/instrumentation';
import type { SpanSessionManager } from '../../api-sessions/index.js';
import { session } from '../../api-sessions/index.js';
import type { PerformanceManager } from '../../utils/index.js';
import { OTelPerformanceManager } from '../../utils/index.js';
import { InstrumentationBase } from '../InstrumentationBase/index.js';
import type { EmbraceInstrumentationBaseArgs } from './types.js';

export abstract class EmbraceInstrumentationBase<
  ConfigType extends InstrumentationConfig = InstrumentationConfig,
> extends InstrumentationBase<ConfigType> {
  private readonly _sessionManager: SpanSessionManager;
  private readonly _perf: PerformanceManager;

  protected constructor({
    instrumentationName,
    instrumentationVersion,
    config,
    diag,
    perf,
  }: EmbraceInstrumentationBaseArgs<ConfigType>) {
    super(instrumentationName, instrumentationVersion, config);
    // optionally override the diag logger from the base class
    if (diag) {
      this._diag = diag;
    }
    this._perf = perf ?? new OTelPerformanceManager();
    this._sessionManager = session.getSpanSessionManager();
  }

  /* Returns session provider */
  protected get sessionManager(): SpanSessionManager {
    return this._sessionManager;
  }

  /* Returns the performance manager */
  protected get perf(): PerformanceManager {
    return this._perf;
  }

  // no-op
  protected override init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    // NOTE: disabling typescript check,to follow the signature from src/instrumentations/InstrumentationAbstract/InstrumentationAbstract.ts
    // which was copied from OTel repo.
    // TBH, I agree with typescript here, but keeping it disabled for consistency with the base repo
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    | void {
    return undefined;
  }
}
