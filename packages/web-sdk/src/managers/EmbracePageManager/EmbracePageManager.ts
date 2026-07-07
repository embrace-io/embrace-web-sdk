import type { PageManager, Route } from '../../api-page/index.ts';
import type { NavigationHost, TitleDocument } from '../../common/index.ts';
import { generateUUID } from '../../utils/index.ts';
import type { RouteMatcher } from './matcher.ts';
import { createRouteMatcher } from './matcher.ts';
import type { EmbracePageManagerArgs } from './types.ts';

export class EmbracePageManager implements PageManager {
  private _currentRoute: Route | null = null;
  private _currentPageId: string | null = null;
  private _pageLabel: string | null = null;
  private readonly _titleDocument: TitleDocument | undefined;
  private readonly _useDocumentTitleAsPageLabel: boolean;
  private readonly _navigationHost: NavigationHost;
  private readonly _matchRoute: RouteMatcher | null;

  public constructor({
    useDocumentTitleAsPageLabel = true,
    titleDocument = window.document,
    routes,
    navigationHost = window as NavigationHost,
  }: EmbracePageManagerArgs = {}) {
    this._useDocumentTitleAsPageLabel = useDocumentTitleAsPageLabel;
    this._titleDocument = titleDocument;
    this._navigationHost = navigationHost;
    this._matchRoute = routes?.length ? createRouteMatcher(routes) : null;

    // When route templates are configured, derive the current route from the URL
    // so page path stays low-cardinality without any app-side wiring: seed it now,
    // then keep it in sync on each (soft) navigation. The listener is intentionally
    // never removed: the page manager lives for the page's lifetime.
    if (this._matchRoute) {
      this._updateRouteFromURL();
      this._navigationHost.navigation?.addEventListener(
        'currententrychange',
        this._onNavigation,
      );
    }
  }

  private readonly _onNavigation = (): void => {
    this._updateRouteFromURL();
  };

  private _updateRouteFromURL(): void {
    if (!this._matchRoute) {
      return;
    }

    const url = new URL(this._navigationHost.location.href).pathname;
    this.setCurrentRoute({ path: this._matchRoute(url), url });
  }

  public getCurrentPageId = (): string | null => this._currentPageId;

  public getCurrentRoute = () => this._currentRoute;

  public setPageLabel = (label: string): void => {
    this._pageLabel = label;
  };

  public getPageLabel = (): string | null => {
    return (
      this._pageLabel ||
      (!this._useDocumentTitleAsPageLabel || !this._titleDocument
        ? null
        : this._titleDocument.title)
    );
  };

  public setCurrentRoute = (route: Route) => {
    if (!this._currentRoute || this._currentRoute.url !== route.url) {
      this._currentPageId = generateUUID();
    }

    this._currentRoute = route;

    if (route.label) {
      this._pageLabel = route.label;
    } else {
      this._pageLabel = null;
    }
  };

  public clearCurrentRoute = () => {
    this._currentRoute = null;
    this._currentPageId = null;
    this._pageLabel = null;
  };
}
