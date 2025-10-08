import type { Route } from '../../api-page/index.js';

export interface PageSpanProcessorArgs {
  pageProvider: PageProvider;
}

export interface PageProvider {
  getCurrentPageId: () => string | null;

  getCurrentRoute: () => Route | null;
}
