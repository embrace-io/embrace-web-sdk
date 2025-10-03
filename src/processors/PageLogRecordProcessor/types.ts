import type { Route } from '../../api-page/index.js';

export interface PageLogRecordProcessorArgs {
  pageProvider: PageProvider;
}

export interface PageProvider {
  getCurrentPageId: () => string;

  getCurrentRoute: () => Route | null;
}
