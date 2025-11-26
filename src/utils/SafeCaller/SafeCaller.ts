import type { DiagLogger } from '@opentelemetry/api';

export class SafeCaller {
  private readonly _diag: DiagLogger;

  constructor(diagParam: DiagLogger) {
    this._diag = diagParam;
  }

  public invoke<R>(fn: () => R) {
    this.invokeWithReturn(fn, undefined);
  }

  public invokeWithReturn<R>(fn: () => R, defaultValue: R) {
    try {
      return fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error.';
      this._diag.error(message);
      return defaultValue;
    }
  }
}
