import {
  ProxySpanSessionManager,
  type SpanSessionManager,
} from '../../manager/index.js';

export class SessionAPI {
  private static _instance?: SessionAPI;
  private _proxySpanSessionManager = new ProxySpanSessionManager();

  public static getInstance(): SessionAPI {
    if (!this._instance) {
      this._instance = new SessionAPI();
    }

    return this._instance;
  }

  public getSpanSessionManager(): SpanSessionManager {
    return this._proxySpanSessionManager;
  }

  public setGlobalSessionManager(sessionManager: SpanSessionManager): void {
    this._proxySpanSessionManager.setDelegate(sessionManager);
  }
}
