import { ProxyUserProvider, type UserProvider } from '../../provider/index.js';

export class UserAPI {
  private static _instance?: UserAPI;
  private _proxyUserProvider = new ProxyUserProvider();

  public static getInstance(): UserAPI {
    if (!this._instance) {
      this._instance = new UserAPI();
    }

    return this._instance;
  }

  public getUserProvider(): UserProvider {
    return this._proxyUserProvider;
  }

  public setGlobalUserProvider(userProvider: UserProvider): void {
    this._proxyUserProvider.setDelegate(userProvider);
  }
}
