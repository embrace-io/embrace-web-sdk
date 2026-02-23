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

  public setAppSurfaceLabel(label: string): void {
    this.getDelegate().setAppSurfaceLabel(label);
  }

  public getAppSurfaceLabel(): string | null {
    return this.getDelegate().getAppSurfaceLabel();
  }

  public clearCurrentRoute(): void {
    this.getDelegate().clearCurrentRoute();
  }
}
