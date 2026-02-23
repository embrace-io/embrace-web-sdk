import type { PageManager, Route } from '../index.ts';

export class NoOpPageManager implements PageManager {
  public setCurrentRoute(_route: Route): void {}

  public getCurrentRoute(): Route | null {
    return null;
  }

  public getCurrentPageId(): string | null {
    return '';
  }

  public setAppSurfaceLabel(_label: string): void {}

  public getAppSurfaceLabel(): string | null {
    return null;
  }

  public clearCurrentRoute(): void {}
}
