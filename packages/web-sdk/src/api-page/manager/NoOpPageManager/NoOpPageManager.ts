import type { PageManager, Route } from '../index.ts';

export class NoOpPageManager implements PageManager {
  public setCurrentRoute(_route: Route): void {}

  public getCurrentRoute(): Route | null {
    return null;
  }

  public getCurrentPageId(): string | null {
    return '';
  }

  public setPageLabel(_label: string): void {}

  public getPageLabel(): string | null {
    return null;
  }

  public clearCurrentRoute(): void {}

  public addRouteChangedListener(
    _listener: (route: Route) => void,
  ): () => void {
    return () => {};
  }
}
