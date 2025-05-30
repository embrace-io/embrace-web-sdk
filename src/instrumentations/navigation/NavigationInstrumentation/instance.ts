import { NavigationInstrumentation } from './NavigationInstrumentation.js';
import type { NavigationInstrumentationArgs } from './types.js';

let navigationInstrumentation: NavigationInstrumentation | undefined =
  undefined;

export const getNavigationInstrumentation = (
  config?: NavigationInstrumentationArgs
): NavigationInstrumentation => {
  if (!navigationInstrumentation) {
    if (!config) {
      throw new Error(
        'NavigationInstrumentation requires configuration the first time is initialized.'
      );
    }

    navigationInstrumentation = new NavigationInstrumentation(config);
  }

  return navigationInstrumentation;
};
