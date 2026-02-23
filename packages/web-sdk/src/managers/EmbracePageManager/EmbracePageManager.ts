import type { PageManager, Route } from '../../api-page/index.ts';
import type { TitleDocument } from '../../common/index.ts';
import { generateUUID } from '../../utils/index.ts';
import type { EmbracePageManagerArgs } from './types.ts';

export class EmbracePageManager implements PageManager {
  private _currentRoute: Route | null = null;
  private _currentPageId: string | null = null;
  private _customAppSurfaceLabel: string | null = null;
  private readonly _titleDocument: TitleDocument | undefined;
  private readonly _disableDocumentTitleFallback: boolean;

  public constructor({
    disableDocumentTitleFallback,
    titleDocument = window.document,
  }: EmbracePageManagerArgs = {}) {
    this._disableDocumentTitleFallback = disableDocumentTitleFallback ?? false;
    this._titleDocument = titleDocument;
  }

  public getCurrentPageId = (): string | null => this._currentPageId;

  public getCurrentRoute = () => this._currentRoute;

  public setAppSurfaceLabel = (label: string): void => {
    this._customAppSurfaceLabel = label;
  };

  public getAppSurfaceLabel = (): string | null => {
    return (
      this._customAppSurfaceLabel ||
      (this._disableDocumentTitleFallback || !this._titleDocument
        ? null
        : this._titleDocument.title)
    );
  };

  public setCurrentRoute = (route: Route) => {
    if (!this._currentRoute || this._currentRoute.url !== route.url) {
      this._currentPageId = generateUUID();
    }

    this._currentRoute = route;
  };

  public clearCurrentRoute = () => {
    this._currentRoute = null;
    this._currentPageId = null;
    this._customAppSurfaceLabel = null;
  };
}
