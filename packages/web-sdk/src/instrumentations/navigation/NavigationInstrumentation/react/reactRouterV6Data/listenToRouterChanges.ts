import type { Route } from '../../../../../api-page/index.ts';
import { page } from '../../../../../api-page/index.ts';
import type { ListenToRouterChangesArgs, Match } from './types.ts';

/**
 * getRouteFromMatches goes through all the matches routes to build the full path
 * nested routes contain only the partial match, so we need to go through all of them
 * in order to build the full path.
 *
 * Filtering by currentPathname ensures that we only consider routes that are relevant to the current URL.
 */
const getRouteFromMatches = (
  matches: Match[],
  currentPathname: string,
): Route | null => {
  const currentMatchIndex = matches.findIndex(
    (match) => match.pathname === currentPathname,
  );

  if (currentMatchIndex === -1 || !matches[currentMatchIndex].route.path) {
    return null;
  }

  // Build full absolute path by reducing all matches up to the current one.
  // Absolute child paths reset the accumulation; relative paths are appended.
  return matches
    .slice(0, currentMatchIndex + 1)
    .reduce<Route | null>((acc, match) => {
      const routePath = match.route.path;

      if (!routePath) {
        return acc;
      }

      // If the route path starts with '/', it's an absolute path and should reset the accumulated path.
      // Otherwise, it's a relative path and should be appended to the accumulated path.
      const path = routePath.startsWith('/')
        ? routePath
        : `${acc?.path ?? ''}/${routePath}`;

      return { path, url: matches[currentMatchIndex].pathname };
    }, null);
};

export const listenToRouterChanges = ({
  router,
  routesMatcher,
  config: { pathnameDocument = window.location } = {},
}: ListenToRouterChangesArgs) => {
  const initialMatches = routesMatcher(router.routes, {
    pathname: pathnameDocument.pathname,
  });

  const initialRoute = initialMatches
    ? getRouteFromMatches(initialMatches, pathnameDocument.pathname)
    : null;

  if (initialRoute) {
    page.setCurrentRoute(initialRoute);
  }

  return router.subscribe((state) => {
    // State has a list of already matched routes
    // https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/router/router.ts#L954
    const currentRoute = getRouteFromMatches(
      state.matches,
      state.location.pathname,
    );

    if (currentRoute) {
      page.setCurrentRoute(currentRoute);
    }
  });
};
