import {
  InstrumentationConfig,
  InstrumentationModuleDefinition,
} from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import { session, SpanSessionManager } from '../../../api-sessions/index.js';

export abstract class SpanSessionInstrumentation<
  ConfigType extends InstrumentationConfig = InstrumentationConfig,
> extends InstrumentationBase<ConfigType> {
  private readonly _sessionManager: SpanSessionManager;

  constructor(
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
  protected init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    | void {
    return undefined;
  }
}
