import type { PathnameDocument } from '../../../../../common/index.js';

type Route = {
  path?: string;
};

export type Match = {
  pathname: string;
  route: Route;
};

type Location = {
  pathname: string;
};

export type RouterState = {
  location: Location;
  matches: Match[];
};

export type MatchRoutesFunction = (
  routes: Route[],
  location: Location
) => Match[] | null;

export interface Router {
  routes: Route[];
  subscribe: (listener: (state: RouterState) => void) => () => void;
}

export type ListenToRouterChangesArgs = {
  router: Router;
  routesMatcher: MatchRoutesFunction;
  config?: {
    pathnameDocument?: PathnameDocument;
  };
};
