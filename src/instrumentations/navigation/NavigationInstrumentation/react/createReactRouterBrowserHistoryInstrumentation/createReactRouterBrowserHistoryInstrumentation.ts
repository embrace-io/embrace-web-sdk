import type { CreateReactRouterBrowserHistoryInstrumentationArgs } from './types.js';
import { getNavigationInstrumentation } from '../../instance.js';

export const createReactRouterBrowserHistoryInstrumentation = ({
  config,
  history,
}: CreateReactRouterBrowserHistoryInstrumentationArgs) => {
  history.listen((location, action) => {
    // Log the navigation event
    console.log('Navigation event:', {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      key: location.key,
      action,
    });

    // Here you can add additional logic, such as sending this data to a server
    // or integrating with a telemetry system.
  });

  return getNavigationInstrumentation(config);
};
