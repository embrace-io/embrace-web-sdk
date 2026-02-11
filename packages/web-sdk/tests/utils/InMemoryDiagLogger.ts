import type { DiagLogger } from '@opentelemetry/api';

// TODO this helper could be contributed back to the OpenTelemetry community
export class InMemoryDiagLogger implements DiagLogger {
  private _errorLogs: string[] = [];
  private _warnLogs: string[] = [];
  private _infoLogs: string[] = [];
  private _debugLogs: string[] = [];
  private _verboseLogs: string[] = [];

  public debug(message: string): void {
    this._debugLogs.push(message);
  }

  public error(message: string): void {
    this._errorLogs.push(message);
  }

  public info(message: string): void {
    this._infoLogs.push(message);
  }

  public verbose(message: string): void {
    this._verboseLogs.push(message);
  }

  public warn(message: string): void {
    this._warnLogs.push(message);
  }

  public getErrorLogs(): string[] {
    return this._errorLogs;
  }

  public getWarnLogs(): string[] {
    return this._warnLogs;
  }

  public getInfoLogs(): string[] {
    return this._infoLogs;
  }

  public getDebugLogs(): string[] {
    return this._debugLogs;
  }

  public getVerboseLogs(): string[] {
    return this._verboseLogs;
  }

  public clear(): void {
    this._errorLogs = [];
    this._warnLogs = [];
    this._infoLogs = [];
    this._debugLogs = [];
    this._verboseLogs = [];
  }
}
