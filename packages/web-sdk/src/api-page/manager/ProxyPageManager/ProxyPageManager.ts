import type { PageManager, Route } from '../index.ts';
import { NoOpPageManager } from '../NoOpPageManager/index.ts';

const NOOP_PAGE_MANAGER = new NoOpPageManager();

export class ProxyPageManager implements PageManager {
  private _delegate?: PageManager;

  public getDelegate(): PageManager {
    return this._delegate ?? NOOP_PAGE_MANAGER;
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

  public addRouteChangedListener(listener: (route: Route) => void): () => void {
    return this.getDelegate().addRouteChangedListener(listener);
  }
}
