import type { PageManager, Route } from '../index.js';

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
