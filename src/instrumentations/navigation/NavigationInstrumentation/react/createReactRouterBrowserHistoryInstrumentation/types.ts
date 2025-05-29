import type { NavigationInstrumentationArgs } from '../../types.js';

interface Location {
  hash: string;
  key?: string;
  pathname: string;
  search: string;
}

type Action = 'PUSH' | 'POP' | 'REPLACE';

interface BrowserHistory {
  listen: (
    listener: (location: Location, action: Action) => void
  ) => () => void;
}

export type CreateReactRouterBrowserHistoryInstrumentationArgs = {
  config: NavigationInstrumentationArgs;
  history: BrowserHistory;
};
