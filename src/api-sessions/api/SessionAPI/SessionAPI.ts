import {
  ProxySpanSessionManager,
  type SpanSessionManager
} from '../../manager/index.js';
import type { SessionAPIArgs } from './types.js';

export class SessionAPI {
  private static _instance?: SessionAPI;
  private readonly _proxySpanSessionManager;

  private constructor({ proxySpanSessionManager }: SessionAPIArgs) {
    this._proxySpanSessionManager = proxySpanSessionManager;
  }

  public static getInstance(): SessionAPI {
    if (!this._instance) {
      this._instance = new SessionAPI({
        proxySpanSessionManager: new ProxySpanSessionManager()
      });
    }

    return this._instance;
  }

  public getSpanSessionManager: () => SpanSessionManager = () => {
    return this._proxySpanSessionManager;
  };

  public setGlobalSessionManager(sessionManager: SpanSessionManager): void {
    this._proxySpanSessionManager.setDelegate(sessionManager);
  }
}
