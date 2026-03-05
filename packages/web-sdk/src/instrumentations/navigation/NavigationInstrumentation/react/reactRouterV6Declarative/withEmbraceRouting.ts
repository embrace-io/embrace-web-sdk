import hoistNonReactStatics from 'hoist-non-react-statics';
import type React from 'react';
import { createElement } from 'react';
import type { Route } from '../../../../../api-page/index.ts';
import { EMB_NAVIGATION_INSTRUMENTATIONS } from '../../../../../constants/index.ts';
import { getNavigationInstrumentation } from '../../index.ts';
import type { RoutesFunctionalComponentReturn } from './types.ts';

// Routes can be nested, we need to traverse the routeContext to find the last route
const getLastRoute = (
  matchedComponent: RoutesFunctionalComponentReturn,
  lastRoute: Route | null,
): Route | null => {
  if (!matchedComponent.props.match || !matchedComponent.props.match.route) {
    return null;
  }

  const childPath = matchedComponent.props.match.route.path;
  const path =
    lastRoute && !childPath.startsWith('/')
      ? `${lastRoute.path}/${childPath}`
      : childPath;

  if (matchedComponent.props.routeContext?.outlet) {
    return getLastRoute(matchedComponent.props.routeContext.outlet, {
      path,
      url: matchedComponent.props.match.pathname,
    });
  }

  return {
    path,
    url: matchedComponent.props.match.pathname,
  };
};

export const withEmbraceRouting = <P extends object>(
  WrappedComponent: React.FunctionComponent<P>,
) => {
  const navigationInstrumentation = getNavigationInstrumentation();
  navigationInstrumentation.setInstrumentationType(
    EMB_NAVIGATION_INSTRUMENTATIONS.Declarative,
  );

  const RoutesWithEmbraceRouting: React.FC<P> = (props: P) => {
    /**
     * React-router v6+ implementation is very different from v5
     * It doesn't have a <Switch> component that injects props into <Route>
     * Instead, it has <Routes> which internally calculates the matched route
     * and returns it as a children, <Route> cannot be wrapped since it requires all children to be a <Route> component
     * here we rely on that matching to get the current route.
     * It's not ideal to rely on internal implementation details, but it's the easier way of getting the current route
     * without having to manually match it or using hooks on each children component
     *
     * See: https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/hooks.tsx#L553
     */
    const matchedComponent = WrappedComponent(
      props,
    ) as unknown as RoutesFunctionalComponentReturn;

    if (matchedComponent.props.match?.route) {
      const lastRoute = getLastRoute(matchedComponent, null);
      if (lastRoute) {
        navigationInstrumentation.setCurrentRoute(lastRoute);
      }
    }

    return createElement<P>(WrappedComponent, props);
  };

  // Keep wrapped component metadata
  RoutesWithEmbraceRouting.displayName = `withEmbraceRouting(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  hoistNonReactStatics(RoutesWithEmbraceRouting, WrappedComponent);

  return RoutesWithEmbraceRouting;
};
