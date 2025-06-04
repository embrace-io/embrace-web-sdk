import * as React from 'react';
import hoistNonReactStatics from 'hoist-non-react-statics';
import type {
  RouteComponentProps,
  SwitchedRouteComponentProps,
} from './types.js';
import { getNavigationInstrumentation } from '../../index.js';
import { EMB_NAVIGATION_INSTRUMENTATIONS } from '../../../../../constants/index.js';

export const withEmbraceRoutingLegacy = <P extends RouteComponentProps>(
  WrappedComponent: React.ComponentType<P>
) => {
  const navigationInstrumentation = getNavigationInstrumentation();
  navigationInstrumentation.setInstrumentationType(
    EMB_NAVIGATION_INSTRUMENTATIONS.DeclarativeLegacy
  );

  const RouteWithEmbraceRoutingLegacy: React.FC<P> = (props: P) => {
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
  RouteWithEmbraceRoutingLegacy.displayName = `withEmbraceRoutingLegacy(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  hoistNonReactStatics(RouteWithEmbraceRoutingLegacy, WrappedComponent);

  return RouteWithEmbraceRoutingLegacy;
};
