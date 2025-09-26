import type { PageManager, Route } from '../index.js';

export class NoOpPageManager implements PageManager {
  public setCurrentRoute(_route: Route): void {}

  public getCurrentRoute(): Route | null {
    return null;
  }
}
