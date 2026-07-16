import hoistNonReactStatics from 'hoist-non-react-statics';
import * as React from 'react';
import { page } from '../../../../../api-page/index.ts';
import type {
  RouteComponentProps,
  SwitchedRouteComponentProps,
} from './types.ts';

export const withEmbraceRoutingLegacy = <P extends RouteComponentProps>(
  WrappedComponent: React.ComponentType<P>,
) => {
  const RouteWithEmbraceRoutingLegacy: React.FC<P> = (props: P) => {
    // Make sure this is Route component
    if (props.path) {
      // Routes get injected with computedMatch when they are children of a <Switch> but the types do not reflect that
      // Manually setting the type here.
      const routeProps = props as SwitchedRouteComponentProps;

      // Depends on this internal behaviour
      // https://github.com/remix-run/react-router/blob/v5.3.4/packages/react-router/modules/Switch.js#L40
      // It shouldn't change as this version is legacy, and it's not being actively worked on
      if (routeProps.computedMatch) {
        page.setCurrentRoute({
          path: routeProps.computedMatch.path,
          url: routeProps.computedMatch.url,
        });
      }
    }

    return React.createElement<P>(WrappedComponent, props);
  };

  // Keep wrapped component metadata
  RouteWithEmbraceRoutingLegacy.displayName = `withEmbraceRoutingLegacy(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  hoistNonReactStatics(RouteWithEmbraceRoutingLegacy, WrappedComponent);

  return RouteWithEmbraceRoutingLegacy;
};
