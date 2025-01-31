import {
  ProxySpanSessionProvider,
  type SpanSessionProvider,
} from '../../provider';

export class SessionAPI {
  private static _instance?: SessionAPI;
  private _proxySpanSessionProvider = new ProxySpanSessionProvider();

  public static getInstance(): SessionAPI {
    if (!this._instance) {
      this._instance = new SessionAPI();
    }

    return this._instance;
  }

  public getSpanSessionProvider(): SpanSessionProvider {
    return this._proxySpanSessionProvider;
  }

  public setGlobalSessionProvider(sessionProvider: SpanSessionProvider): void {
    this._proxySpanSessionProvider.setDelegate(sessionProvider);
  }
}
