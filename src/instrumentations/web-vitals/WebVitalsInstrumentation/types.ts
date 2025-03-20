import type { MeterProvider } from '@opentelemetry/api';
import { type SpanSessionManager } from '../../../api-sessions/index.js';

export type TrackingLevel = 'core' | 'all';

export interface WebVitalsInstrumentationArgs {
  trackingLevel?: TrackingLevel;
  spanSessionManager: SpanSessionManager;
  meterProvider: MeterProvider;
}
