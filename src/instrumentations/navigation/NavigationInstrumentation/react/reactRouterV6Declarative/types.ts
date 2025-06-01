// Marking everything as optional to force checking in case internal implementation changes
// https://github.com/remix-run/react-router/blob/c06ec85cf05e0ec5a3f399160ae3512206fac980/packages/react-router/lib/router/utils.ts#L624
export type RoutesFunctionalComponentReturn = {
  props: {
    match?: {
      pathname: string;
      pathnameBase: string;
      route?: {
        path: string;
      };
    };
    routeContext?: {
      // Nested routes are under outlet
      outlet: RoutesFunctionalComponentReturn | null;
    };
  };
};
