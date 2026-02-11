export interface RouteComponentProps {
  path?: string | readonly string[];
}

export interface SwitchedRouteComponentProps extends RouteComponentProps {
  computedMatch?: {
    isExact: boolean;
    params: Record<string, unknown>;
    path: string;
    url: string;
  };
}
