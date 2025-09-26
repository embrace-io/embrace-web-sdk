import type { PageManager, Route } from '../../api-page/index.js';

export class EmbracePageManager implements PageManager {
  private _currentRoute: Route | null = null;

  public getCurrentRoute = () => this._currentRoute;

  public setCurrentRoute = (route: Route) => {
    this._currentRoute = route;
  };
}
