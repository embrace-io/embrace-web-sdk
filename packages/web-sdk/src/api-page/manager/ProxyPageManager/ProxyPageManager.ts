import { diag } from '@opentelemetry/api';
import type { PageManager, Route } from '../index.ts';
import { NoOpPageManager } from '../NoOpPageManager/index.ts';

const NOOP_PAGE_MANAGER = new NoOpPageManager();
const PROXY_DIAG = diag.createComponentLogger({
  namespace: 'ProxyPageManager',
});

export class ProxyPageManager implements PageManager {
  private _delegate?: PageManager;

  public getDelegate(): PageManager {
    if (!this._delegate) {
      PROXY_DIAG.debug('called before initSDK(); using no-op');
      return NOOP_PAGE_MANAGER;
    }
    return this._delegate;
  }

  public setDelegate(delegate: PageManager): void {
    this._delegate = delegate;
  }

  public setCurrentRoute(route: Route): void {
    this.getDelegate().setCurrentRoute(route);
  }

  public getCurrentRoute(): Route | null {
    return this.getDelegate().getCurrentRoute();
  }

  public getCurrentPageId(): string | null {
    return this.getDelegate().getCurrentPageId();
  }

  public setPageLabel(label: string): void {
    this.getDelegate().setPageLabel(label);
  }

  public getPageLabel(): string | null {
    return this.getDelegate().getPageLabel();
  }

  public clearCurrentRoute(): void {
    this.getDelegate().clearCurrentRoute();
  }
}
