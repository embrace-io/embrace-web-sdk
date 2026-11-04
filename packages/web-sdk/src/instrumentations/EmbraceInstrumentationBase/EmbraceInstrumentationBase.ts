import { InstrumentationBase } from '@opentelemetry/browser-api';
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
  ConfigType extends object = object,
> extends InstrumentationBase<ConfigType> {
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
    perf,
    limitManager,
  }: EmbraceInstrumentationBaseArgs<ConfigType>) {
    super(instrumentationName, instrumentationVersion, config);
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
    if (this.isEnabled() && this.userSessionManager) {
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

  /** Stops emitting and removes listeners. Patches stay. */
  public override disable(): void {
    super.disable();
    // After super, so the base's _onEnable rollback and an _onDisable that throws still unregister.
    this.unregisterSessionPartListeners();
  }
}
