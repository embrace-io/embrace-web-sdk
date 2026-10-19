import type { Route } from '../../../../../api-page/index.ts';
import { page } from '../../../../../api-page/index.ts';
import type { ListenToRouterChangesArgs, Match } from './types.ts';

/**
 * matchRoutes already scopes `matches` to the given pathname, ordered from
 * the root route to the deepest one, so the full pattern is built by
 * reducing over all of them. Pathless layout and index routes contribute no
 * `route.path` of their own, so they're skipped.
 */
const getRouteFromMatches = (
  matches: Match[],
  currentPathname: string,
): Route | null => {
  return matches.reduce<Route | null>((acc, match) => {
    const routePath = match.route.path;

    if (!routePath) {
      return acc;
    }

    // If the route path starts with '/', it's an absolute path and should reset the accumulated path.
    // Otherwise, it's a relative path and should be appended to the accumulated path.
    const path = routePath.startsWith('/')
      ? routePath
      : `${acc?.path ?? ''}/${routePath}`;

    return { path, url: currentPathname };
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
