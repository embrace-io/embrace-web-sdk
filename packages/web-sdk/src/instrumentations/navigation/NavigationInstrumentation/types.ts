export type NavigationInstrumentationArgs = {
  /**
   * If set to `true`, the instrumentation will remove path options from the route name.
   * e.g. it will convert `/order/:orderState(pending|shipped|delivered)` to `/order/:orderState`.
   *
   * *default*: true
   */
  shouldCleanupPathOptionsFromRouteName?: boolean;
};
