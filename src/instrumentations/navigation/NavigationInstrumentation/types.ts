import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export type NavigationInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
> & {
  shouldCleanupPathOptionsFromRouteName?: boolean;
};

export interface Route {
  // This is the path of the route before replacing the URL params. i.e. /products/:productId
  path: string;
  // This is the URL of the route after replacing the URL params. i.e. /products/123
  url: string;
}
