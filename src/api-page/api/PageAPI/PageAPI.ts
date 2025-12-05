import type { PageManager, Route } from '../../manager/index.ts';
import { ProxyPageManager } from '../../manager/index.ts';
import type { PageAPIArgs } from './types.ts';

export class PageAPI implements PageManager {
  private static _instance?: PageAPI;
  private readonly _proxyPageManager;

  private constructor({ proxyPageManager }: PageAPIArgs) {
    this._proxyPageManager = proxyPageManager;
  }

  public static getInstance(): PageAPI {
    if (!PageAPI._instance) {
      PageAPI._instance = new PageAPI({
        proxyPageManager: new ProxyPageManager(),
      });
    }

    return PageAPI._instance;
  }

  public getPageManager(): PageManager {
    return this._proxyPageManager;
  }

  public setGlobalPageManager(pageManager: PageManager): void {
    this._proxyPageManager.setDelegate(pageManager);
  }

  public setCurrentRoute(route: Route): void {
    this.getPageManager().setCurrentRoute(route);
  }

  public getCurrentRoute(): Route | null {
    return this.getPageManager().getCurrentRoute();
  }

  public getCurrentPageId(): string | null {
    return this.getPageManager().getCurrentPageId();
  }

  public clearCurrentRoute(): void {
    this.getPageManager().clearCurrentRoute();
  }
}
