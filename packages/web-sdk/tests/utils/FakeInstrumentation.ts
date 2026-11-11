import { EmbraceInstrumentationBase } from '../../src/instrumentations/index.ts';

export class FakeInstrumentation extends EmbraceInstrumentationBase {
  public startCount = 0;
  public endCount = 0;
  public enableHookCalls = 0;
  public disableHookCalls = 0;
  // Exposes the protected getters, so tests can check what enable() locked.
  public readonly managers = {
    userSessionManager: () => this.userSessionManager,
    logManager: () => this.logManager,
    limitManager: () => this.limitManager,
    perf: () => this.perf,
    pageManager: () => this.pageManager,
  };

  public constructor() {
    super({
      instrumentationName: 'FakeInstrumentation',
      instrumentationVersion: '1.0.0',
      config: {},
    });
  }

  protected override _onDisable(): void {
    this.disableHookCalls += 1;
  }

  protected override _onEnable(): void {
    this.enableHookCalls += 1;
    this.setSessionPartListeners({
      start: () => {
        this.startCount += 1;
      },
      end: () => {
        this.endCount += 1;
      },
    });
  }

  public emit(): void {
    if (this.isEnabled()) {
      this.logger.emit({
        body: 'my log',
      });

      this.tracer.startSpan('my span').end();
    }
  }
}
