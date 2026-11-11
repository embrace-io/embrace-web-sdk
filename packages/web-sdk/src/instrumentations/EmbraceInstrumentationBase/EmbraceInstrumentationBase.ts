import { InstrumentationBase } from '@opentelemetry/browser-api';
import type { LogManager } from '../../api-logs/index.ts';
import { log } from '../../api-logs/index.ts';
import type { PageManager } from '../../api-page/index.ts';
import { page } from '../../api-page/index.ts';
import type { SessionPartStartedEvent } from '../../api-sessions/index.ts';
import { session } from '../../api-sessions/index.ts';
import type {
  LimitManagerInternal,
  UserSessionManagerInternal,
} from '../../managers/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import { OTelPerformanceManager } from '../../utils/index.ts';
import type {
  EmbraceInstrumentationBaseArgs,
  EmbraceInstrumentationDeps,
} from './types.ts';

type SessionPartListeners = {
  start?: (event: SessionPartStartedEvent) => void;
  end?: () => void;
};
type RemoveSessionPartListeners = {
  start?: () => void;
  end?: () => void;
};
interface EmbraceManagers {
  userSessionManager: UserSessionManagerInternal;
  logManager: LogManager;
  limitManager: LimitManagerInternal | undefined;
  perf: PerformanceManager;
  pageManager: PageManager;
}

export abstract class EmbraceInstrumentationBase<
  ConfigType extends object = object,
> extends InstrumentationBase<ConfigType> {
  private _managers: EmbraceManagers | undefined;
  private _removeSessionPartListeners: RemoveSessionPartListeners = {};
  private _sessionPartListeners: SessionPartListeners = {};

  protected constructor({
    instrumentationName,
    instrumentationVersion,
    config,
  }: EmbraceInstrumentationBaseArgs<ConfigType>) {
    super(instrumentationName, instrumentationVersion, config);
  }

  /**
   * Starts emitting. The first call locks the Embrace managers in `deps`, the
   * same way it locks the tracer and logger providers.
   */
  public override enable(deps?: EmbraceInstrumentationDeps): void {
    // Locked before super.enable(), which runs _init() and _onEnable().
    this._managers ??= {
      userSessionManager:
        deps?.userSessionManager ?? session.getUserSessionManager(),
      logManager: deps?.logManager ?? log.getLogManager(),
      limitManager: deps?.limitManager,
      perf: deps?.perf ?? new OTelPerformanceManager(),
      pageManager: deps?.pageManager ?? page.getPageManager(),
    };
    super.enable(deps);
  }

  /** Stops emitting and removes listeners. Patches stay. */
  public override disable(): void {
    super.disable();
    // After super, so the base's _onEnable rollback and an _onDisable that throws still unregister.
    this.unregisterSessionPartListeners();
  }

  /** Throws until the first `enable()`. */
  protected get userSessionManager(): UserSessionManagerInternal {
    return this._requireManagers('userSessionManager').userSessionManager;
  }

  /** Throws until the first `enable()`. */
  protected get logManager(): LogManager {
    return this._requireManagers('logManager').logManager;
  }

  /** Throws until the first `enable()`. */
  protected get perf(): PerformanceManager {
    return this._requireManagers('perf').perf;
  }

  /** Throws until the first `enable()`. Undefined means no limits apply. */
  protected get limitManager(): LimitManagerInternal | undefined {
    return this._requireManagers('limitManager').limitManager;
  }

  /** Throws until the first `enable()`. */
  protected get pageManager(): PageManager {
    return this._requireManagers('pageManager').pageManager;
  }

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

  private _requireManagers(name: keyof EmbraceManagers): EmbraceManagers {
    if (!this._managers) {
      throw new Error(
        `${this.instrumentationName}: ${name} is not available until enable() is called`,
      );
    }
    return this._managers;
  }

  private _registerSessionPartListeners(): void {
    if (this.isEnabled()) {
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
}
