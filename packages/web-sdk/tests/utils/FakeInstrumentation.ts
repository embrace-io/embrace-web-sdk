import { EmbraceInstrumentationBase } from '../../src/instrumentations/index.ts';

export class FakeInstrumentation extends EmbraceInstrumentationBase {
  public startCount = 0;
  public endCount = 0;

  public constructor() {
    super({
      instrumentationName: 'FakeInstrumentation',
      instrumentationVersion: '1.0.0',
      config: {},
    });
  }

  public override onDisable(): void {
    // no-op
  }

  public override onEnable(): void {
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
    if (this._isEnabled) {
      this.logger.emit({
        body: 'my log',
      });

      this.tracer.startSpan('my span').end();
    }
  }
}
