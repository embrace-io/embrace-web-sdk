import { type SpanSessionManager } from '../../../api-sessions/index.js';
import type { MeterProvider } from '@opentelemetry/api';

export type TrackingLevel = 'core' | 'all';

export interface WebVitalsInstrumentationArgs {
  trackingLevel?: TrackingLevel;
  spanSessionManager: SpanSessionManager;
  meterProvider: MeterProvider;
}
