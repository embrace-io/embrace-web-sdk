export const SOFT_NAVIGATION_ENTRY_TYPE = 'soft-navigation' as const;

export interface SoftNavigationPerformanceEntry extends PerformanceEntry {
  readonly entryType: 'soft-navigation';
  readonly duration: 0;
  readonly navigationId: string;
  readonly paintTime: number;
  toJSON(): {
    name: string;
    entryType: 'soft-navigation';
    startTime: number;
    duration: 0;
    navigationId: string;
    paintTime: number;
  };
}

export interface SoftNavigationObserverOptions {
  interactionTimeoutMs?: number;
  bufferSize?: number;
}
