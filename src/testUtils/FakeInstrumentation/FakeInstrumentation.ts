import { EmbraceInstrumentationBase } from '../../instrumentations/EmbraceInstrumentationBase/index.js';

export class FakeInstrumentation extends EmbraceInstrumentationBase {
  private _enabled = false;

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

  public disable(): void {
    this._enabled = false;
  }

  public enable(): void {
    this._enabled = true;
  }

  public emit(): void {
    if (this._enabled) {
      this.logger.emit({
        body: 'my log',
      });

      this.tracer.startSpan('my span').end();
    }
  }
}
