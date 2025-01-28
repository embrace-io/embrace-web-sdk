import { type SpanSessionProvider } from '../../../api-sessions';
import { MeterProvider } from '@opentelemetry/api';

export type TrackingLevel = 'core' | 'all';

export interface WebVitalsInstrumentationArgs {
  trackingLevel?: TrackingLevel;
  spanSessionProvider: SpanSessionProvider;
  meterProvider: MeterProvider;
}
