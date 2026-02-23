import type { PageManager, Route } from '../index.ts';

export class NoOpPageManager implements PageManager {
  public setCurrentRoute(_route: Route): void {}

  public getCurrentRoute(): Route | null {
    return null;
  }

  public getCurrentPageId(): string | null {
    return '';
  }

  public clearCurrentRoute(): void {}
}
