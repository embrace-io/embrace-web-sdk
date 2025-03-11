import type {
  InstrumentationConfig,
  InstrumentationModuleDefinition,
} from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import type { SpanSessionManager } from '../../../api-sessions/index.js';
import { session } from '../../../api-sessions/index.js';

export abstract class SpanSessionInstrumentation<
  ConfigType extends InstrumentationConfig = InstrumentationConfig,
> extends InstrumentationBase<ConfigType> {
  private readonly _sessionManager: SpanSessionManager;

  public constructor(
    instrumentationName: string,
    instrumentationVersion: string,
    config: ConfigType
  ) {
    super(instrumentationName, instrumentationVersion, config);
    this._sessionManager = session.getSpanSessionManager();
  }

  /* Returns session provider */
  protected get sessionManager(): SpanSessionManager {
    return this._sessionManager;
  }

  // no-op
  protected override init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    // NOTE: disabling typescript check, as this class was copied from OTel repo.
    // TBH, I agree with typescript here, but keeping it disabled for consistency with the base repo
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    | void {
    return undefined;
  }
}
