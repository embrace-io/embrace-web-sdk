import type { MeterProvider } from '@opentelemetry/api';
import { type SpanSessionManager } from '../../../api-sessions/index.js';
import type { EmbraceInstrumentationBaseArgs } from '../../session/index.js';

export type TrackingLevel = 'core' | 'all';

export type WebVitalsInstrumentationArgs = {
  trackingLevel?: TrackingLevel;
  spanSessionManager: SpanSessionManager;
  meterProvider: MeterProvider;
} & Pick<EmbraceInstrumentationBaseArgs, 'perf'>;
