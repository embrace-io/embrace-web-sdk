import * as React from 'react';
import hoistNonReactStatics from 'hoist-non-react-statics';
import type {
  RouteComponentProps,
  SwitchedRouteComponentProps,
} from './types.js';
import { getNavigationInstrumentation } from '../../index.js';

export const withOTelRouting = <P extends RouteComponentProps>(
  WrappedComponent: React.ComponentType<P>
) => {
  const RouteWithOTelRouting: React.FC<P> = (props: P) => {
    const navigationInstrumentation = getNavigationInstrumentation();
    // Make sure this is Route component
    if (props.path) {
      // Routes get injected with computedMatch when they are children of a <Switch> but the types do not reflect that
      // Manually setting the type here.
      const routeProps = props as SwitchedRouteComponentProps;

      if (routeProps.computedMatch) {
        navigationInstrumentation.setCurrentRoute({
          path: routeProps.computedMatch.path,
          url: routeProps.computedMatch.url,
        });
      }
    }

    return React.createElement<P>(WrappedComponent, props);
  };

  // Keep wrapped component metadata
  RouteWithOTelRouting.displayName = `withOTelRouting(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  hoistNonReactStatics(RouteWithOTelRouting, WrappedComponent);

  return RouteWithOTelRouting;
};
