import type { RoutesFunctionalComponentReturn } from './types.js';
import React from 'react';
import hoistNonReactStatics from 'hoist-non-react-statics';
import { getNavigationInstrumentation } from '../../index.js';
import type { Route } from '../../index.js';
import { EMB_NAVIGATION_INSTRUMENTATIONS } from '../../../../../constants/index.js';

// Routes can be nested, we need to traverse the routeContext to find the last route
const getLastRoute = (
  matchedComponent: RoutesFunctionalComponentReturn,
  lastRoute: Route | null
): Route | null => {
  if (!matchedComponent.props.match || !matchedComponent.props.match.route) {
    return null;
  }

  const path = lastRoute
    ? `${lastRoute.path}/${matchedComponent.props.match.route.path}`
    : matchedComponent.props.match.route.path;

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
  WrappedComponent: React.FunctionComponent<P>
) => {
  const navigationInstrumentation = getNavigationInstrumentation();
  navigationInstrumentation.setInstrumentationType(
    EMB_NAVIGATION_INSTRUMENTATIONS.Declarative
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
     */
    const matchedComponent = WrappedComponent(
      props
    ) as unknown as RoutesFunctionalComponentReturn;

    if (matchedComponent.props.match && matchedComponent.props.match.route) {
      const lastRoute = getLastRoute(matchedComponent, null);
      if (lastRoute) {
        navigationInstrumentation.setCurrentRoute(lastRoute);
      }
    }

    return React.createElement<P>(WrappedComponent, props);
  };

  // Keep wrapped component metadata
  RoutesWithEmbraceRouting.displayName = `withEmbraceRouting(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  hoistNonReactStatics(RoutesWithEmbraceRouting, WrappedComponent);

  return RoutesWithEmbraceRouting;
};
