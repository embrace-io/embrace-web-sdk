interface Surface {
  name: string;
}

export interface SurfaceProvider {
  getCurrentSurface: () => Surface | null;
}
