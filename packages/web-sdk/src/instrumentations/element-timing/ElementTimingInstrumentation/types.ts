export type PerformanceElementTiming = PerformanceEntry & {
  identifier: string;
  element: Element | null;
  renderTime: number;
  loadTime: number;
  url: string;
  naturalWidth: number;
  naturalHeight: number;
};
