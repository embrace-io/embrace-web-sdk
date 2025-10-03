import type { PageManager, Route } from '../../api-page/index.js';
import { generateUUID } from '../../utils/index.js';

export class EmbracePageManager implements PageManager {
  private _currentRoute: Route | null = null;
  private _currentPageId: string = generateUUID();

  public getCurrentPageId = () => this._currentPageId;

  public getCurrentRoute = () => this._currentRoute;

  public setCurrentRoute = (route: Route) => {
    if (this._currentRoute && this._currentRoute.url !== route.url) {
      this._currentPageId = generateUUID();
    }

    this._currentRoute = route;
  };
}
