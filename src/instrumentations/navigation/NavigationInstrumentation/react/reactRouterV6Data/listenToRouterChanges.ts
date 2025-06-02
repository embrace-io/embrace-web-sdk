import type { ListenToRouterChangesArgs, Match } from './types.js';
import type { Route } from '../../index.js';
import { getNavigationInstrumentation } from '../../index.js';

const getRouteFromMatches = (
  matches: Match[],
  currentPathname: string
): Route | null =>
  matches
    .filter(m => currentPathname.includes(m.pathname))
    .reduce<null | Route>((route, match) => {
      if (!match.route.path) {
        return route;
      }

      if (route) {
        return {
          url: match.pathname,
          path: `${route.path}/${match.route.path}`,
        } as Route;
      }

      return {
        url: match.pathname,
        path: match.route.path,
      } as Route;
    }, null);

export const listenToRouterChanges = ({
  router,
  routesMatcher,
  config: { pathnameDocument = window.location } = {},
}: ListenToRouterChangesArgs) => {
  const navigationInstrumentation = getNavigationInstrumentation();
  const initialMatches = routesMatcher(router.routes, {
    pathname: pathnameDocument.pathname,
  });

  const initialRoute = initialMatches
    ? getRouteFromMatches(initialMatches, pathnameDocument.pathname)
    : null;

  if (initialRoute) {
    navigationInstrumentation.setCurrentRoute(initialRoute);
  }

  return router.subscribe(state => {
    const currentRoute = getRouteFromMatches(
      state.matches,
      state.location.pathname
    );

    if (currentRoute) {
      navigationInstrumentation.setCurrentRoute(currentRoute);
    }
  });
};
