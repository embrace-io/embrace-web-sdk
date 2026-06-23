import { EmbraceInstrumentationBase } from '../../src/instrumentations/index.ts';

export class FakeInstrumentation extends EmbraceInstrumentationBase {
  public constructor() {
    super({
      instrumentationName: 'FakeInstrumentation',
      instrumentationVersion: '1.0.0',
      config: {},
    });

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override onDisable(): void {
    // no-op
  }

  public override onEnable(): void {
    // no-op
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
