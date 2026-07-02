import type { PageManager, Route } from '../../api-page/manager/types.ts';
import type { TitleDocument } from '../../common/types.ts';
import { generateUUID } from '../../utils/generateUUID.ts';
import type { EmbracePageManagerArgs } from './types.ts';

export class EmbracePageManager implements PageManager {
  private _currentRoute: Route | null = null;
  private _currentPageId: string | null = null;
  private _pageLabel: string | null = null;
  private readonly _titleDocument: TitleDocument | undefined;
  private readonly _useDocumentTitleAsPageLabel: boolean;

  public constructor({
    useDocumentTitleAsPageLabel = true,
    titleDocument = window.document,
  }: EmbracePageManagerArgs = {}) {
    this._useDocumentTitleAsPageLabel = useDocumentTitleAsPageLabel;
    this._titleDocument = titleDocument;
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
