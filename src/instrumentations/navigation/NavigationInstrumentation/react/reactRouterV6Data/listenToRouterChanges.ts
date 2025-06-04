import type { ListenToRouterChangesArgs, Match } from './types.js';
import type { Route } from '../../index.js';
import { getNavigationInstrumentation } from '../../index.js';
import { EMB_NAVIGATION_INSTRUMENTATIONS } from '../../../../../constants/index.js';

/**
 * getRouteFromMatches goes through all the matches routes to build the full path
 * nested routes contain only the partial match, so we need to go through all of them
 * in order to build the full path.
 *
 * Filtering by currentPathname ensures that we only consider routes that are relevant to the current URL.
 */
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
  navigationInstrumentation.setInstrumentationType(
    EMB_NAVIGATION_INSTRUMENTATIONS.Data
  );

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
    // State has a list of already matched routes
    // https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/router/router.ts#L954
    const currentRoute = getRouteFromMatches(
      state.matches,
      state.location.pathname
    );

    if (currentRoute) {
      navigationInstrumentation.setCurrentRoute(currentRoute);
    }
  });
};
