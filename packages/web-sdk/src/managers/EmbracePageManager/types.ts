import type { NavigationHost, TitleDocument } from '../../common/index.ts';

export interface EmbracePageManagerArgs {
  useDocumentTitleAsPageLabel?: boolean;
  titleDocument?: TitleDocument;
  /**
   * Route templates ('/order/:id', '/files/*') used to collapse high-cardinality
   * URLs into stable page paths. When set, the current route is derived from the
   * URL on each navigation.
   */
  routes?: string[];
  /**
   * Window-shaped object used to read the current URL and listen for soft
   * navigations via the Navigation API. Defaults to `window`. Only used when
   * `routes` is set.
   */
  navigationHost?: NavigationHost;
}
