import type {
  Instrumentation,
  InstrumentationConfig,
  InstrumentationModuleDefinition,
} from '@opentelemetry/instrumentation';
import type { LogManager } from '../../api-logs/index.ts';
import { log } from '../../api-logs/index.ts';
import { session } from '../../api-sessions/index.ts';
import type {
  LimitManagerInternal,
  UserSessionManagerInternal,
} from '../../managers/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import { OTelPerformanceManager } from '../../utils/index.ts';
import { InstrumentationAbstract } from '../InstrumentationAbstract/index.ts';
import type { EmbraceInstrumentationBaseArgs } from './types.ts';

export abstract class EmbraceInstrumentationBase<
    ConfigType extends InstrumentationConfig = InstrumentationConfig,
  >
  extends InstrumentationAbstract<ConfigType>
  implements Instrumentation<ConfigType>
{
  private _userSessionManager: UserSessionManagerInternal;
  private _logManager: LogManager;
  private readonly _perf: PerformanceManager;
  private _limitManager: LimitManagerInternal | undefined;

  protected constructor({
    instrumentationName,
    instrumentationVersion,
    config,
    diag,
    perf,
    limitManager,
  }: EmbraceInstrumentationBaseArgs<ConfigType>) {
    super(instrumentationName, instrumentationVersion, config);
    // optionally override the diag logger from the base class
    if (diag) {
      this._diag = diag;
    }
    this._perf = perf ?? new OTelPerformanceManager();
    this._limitManager = limitManager;
    this._userSessionManager = session.getUserSessionManager();
    this._logManager = log.getLogManager();
  }

  /* Returns session provider */
  protected get userSessionManager(): UserSessionManagerInternal {
    return this._userSessionManager;
  }

  /* Returns log manager */
  protected get logManager(): LogManager {
    return this._logManager;
  }

  /* Returns the performance manager */
  protected get perf(): PerformanceManager {
    return this._perf;
  }

  /* Returns the limit manager */
  protected get limitManager(): LimitManagerInternal | undefined {
    return this._limitManager;
  }

  public setLimitManager(limitManager: LimitManagerInternal): void {
    this._limitManager = limitManager;
  }

  // no-op
  // Note: OTel uses `| void` but we use `| undefined` for semantic clarity.
  // `void` in union types is confusing because it mixes "returns nothing" with "returns data or nothing".
  // `undefined` better expresses the intent: this method may or may not return a value.
  protected override init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    | undefined {
    return;
  }

  public setLogManager(logManager: LogManager): void {
    this._logManager = logManager;
  }

  public setUserSessionManager(
    userSessionManager: UserSessionManagerInternal,
  ): void {
    this._userSessionManager = userSessionManager;
  }
}
