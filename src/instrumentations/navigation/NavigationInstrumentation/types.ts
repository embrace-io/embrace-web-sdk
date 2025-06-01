import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export type NavigationInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
> & {
  /**
   * If set to `true`, the instrumentation will remove path options from the route name.
   * e.g. it will convert `/order/:orderState(pending|shipped|delivered)` to `/order/:orderState`.
   *
   * *default*: true
   */
  shouldCleanupPathOptionsFromRouteName?: boolean;
};

export interface Route {
  // This is the path of the route before replacing the URL params. i.e. /products/:productId
  path: string;
  // This is the URL of the route after replacing the URL params. i.e. /products/123
  url: string;
}
