import type {
  Instrumentation,
  InstrumentationConfig,
  InstrumentationModuleDefinition,
} from '@opentelemetry/instrumentation';
import type { LogManager } from '../../api-logs/index.ts';
import { log } from '../../api-logs/index.ts';
import type { SessionPartStartedEvent } from '../../api-sessions/index.ts';
import { session } from '../../api-sessions/index.ts';
import type {
  LimitManagerInternal,
  UserSessionManagerInternal,
} from '../../managers/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import { OTelPerformanceManager } from '../../utils/index.ts';
import { InstrumentationAbstract } from '../InstrumentationAbstract/index.ts';
import type { EmbraceInstrumentationBaseArgs } from './types.ts';

type SessionPartListeners = {
  start?: (event: SessionPartStartedEvent) => void;
  end?: () => void;
};
type RemoveSessionPartListeners = {
  start?: () => void;
  end?: () => void;
};
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
  private _removeSessionPartListeners: RemoveSessionPartListeners = {};
  private _sessionPartListeners: SessionPartListeners = {};

  protected constructor({
    instrumentationName,
    instrumentationVersion,
    config,
    diag,
    perf,
    limitManager,
  }: EmbraceInstrumentationBaseArgs<ConfigType>) {
    super(instrumentationName, instrumentationVersion, config);
    /*
     * Construction only wires an instrumentation up; registerInstrumentations
     * starts it. It attaches the tracer and logger providers first and then
     * enables whatever still reports itself disabled, so enabling here would
     * emit start-up telemetry into a provider that records nothing.
     */
    this._isEnabled = false;
    // optionally override the diag logger from the base class
    if (diag) {
      this._diag = diag;
    }
    this._perf = perf ?? new OTelPerformanceManager();
    this._limitManager = limitManager;
    this._userSessionManager = session.getUserSessionManager();
    this._logManager = log.getLogManager();
  }

  /*
   * Backed by config.enabled rather than a field of its own: that is the flag
   * registerInstrumentations reads to decide whether an instrumentation still
   * needs starting, so the two must never disagree.
   */
  protected get _isEnabled(): boolean {
    return this._config.enabled === true;
  }

  protected set _isEnabled(enabled: boolean) {
    this._config.enabled = enabled;
  }

  /*
   * The base setConfig defaults enabled to true, which would flip _isEnabled
   * without onEnable running. Lifecycle state moves only through
   * enable()/disable(), so it survives config replacement.
   */
  public override setConfig(config: ConfigType): void {
    const wasEnabled = this._isEnabled;
    super.setConfig(config);
    this._isEnabled = wasEnabled;
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
    this._registerSessionPartListeners();
  }

  /*
   * Management of session part listeners
   */

  protected setSessionPartListeners(listeners: SessionPartListeners): void {
    this._sessionPartListeners = listeners;
    this._registerSessionPartListeners();
  }

  protected unregisterSessionPartListeners(): void {
    if (this._removeSessionPartListeners.start) {
      this._removeSessionPartListeners.start();
    }

    if (this._removeSessionPartListeners.end) {
      this._removeSessionPartListeners.end();
    }

    this._removeSessionPartListeners = {};
  }

  private _registerSessionPartListeners(): void {
    if (this._isEnabled && this.userSessionManager) {
      this.unregisterSessionPartListeners();

      if (this._sessionPartListeners.start) {
        this._removeSessionPartListeners.start =
          this.userSessionManager.addSessionPartStartedListener((event) =>
            this._sessionPartListeners.start?.(event),
          );
      }

      if (this._sessionPartListeners.end) {
        this._removeSessionPartListeners.end =
          this.userSessionManager.addSessionPartEndedListener(() =>
            this._sessionPartListeners.end?.(),
          );
      }
    }
  }

  public override disable(): void {
    if (!this._isEnabled) {
      return;
    }

    this._isEnabled = false;
    this.onDisable();
    this.unregisterSessionPartListeners();
  }

  public override enable(): void {
    if (this._isEnabled) {
      return;
    }

    this._isEnabled = true;
    this.onEnable();
  }

  /* Only triggered when the instrumentation transitions to disabled */
  protected abstract onDisable(): void;

  /* Only triggered when the instrumentation transitions to enabled */
  public abstract onEnable(): void;
}
