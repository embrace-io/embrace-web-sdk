import type {
  EmbraceExtendedSpan,
  EmbraceExtendedSpanOptions,
} from '../api/index.js';

export interface TraceManager {
  startSpan: (
    name: string,
    options?: EmbraceExtendedSpanOptions
  ) => EmbraceExtendedSpan | null;
}
