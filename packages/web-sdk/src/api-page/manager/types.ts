export interface Route {
  // This is the path of the route before replacing the URL params. i.e. /products/:productId
  path: string;
  // This is the URL of the route after replacing the URL params. i.e. /products/123
  url: string;
  // Optional label for the route, used as app.surface.label
  label?: string;
}

export interface PageManager {
  setCurrentRoute: (route: Route) => void;

  getCurrentRoute: () => Route | null;

  getCurrentPageId: () => string | null;

  setPageLabel: (label: string) => void;

  getPageLabel: () => string | null;

  clearCurrentRoute: () => void;

  // Fired on every setCurrentRoute call. Lets consumers (NavigationInstrumentation)
  // learn about route changes without the reporter (react-router integrations)
  // depending on them directly.
  addRouteChangedListener: (listener: (route: Route) => void) => () => void;
}
