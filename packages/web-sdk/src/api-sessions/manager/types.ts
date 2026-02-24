import type { HrTime } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import type { ExtendedSpan } from '../../index.ts';

export interface SpanSessionManager {
  getSessionId: () => string | null;

  getPreviousSessionId: () => string | null;

  getSessionStartTime: () => HrTime | null;

  getSessionSpan: () => ExtendedSpan | null;

  startSessionSpan: (options?: StartSessionOptions) => void;

  endSessionSpan: () => void;

  addBreadcrumb: (name: string) => void;

  addProperty: (key: string, value: string, options?: PropertyOptions) => void;

  removeProperty: (key: string) => void;

  // todo move this to another class SpanSessionManagerInternal that is only accessible from within our code, but expose the external one without the method to the users.
  endSessionSpanInternal: (reason: ReasonSessionEnded) => void;

  currentSessionAsReadableSpan: (
    reason: ReasonSessionEnded,
  ) => ReadableSpan | null;

  addSessionStartedListener: (listener: () => void) => () => void;

  addSessionEndedListener: (listener: () => void) => () => void;
}

export type ReasonSessionEnded =
  | 'unknown'
  | 'inactivity' // inactivity timer
  | 'timer' // max_time_reached limit
  | 'manual' // using the public api
  | 'max_size_reached'
  | 'state_changed' // visibility change
  | 'bfcache'; // page entering back-forward cache

export type PropertyOptions = {
  lifespan?: 'permanent';
};

export type StartSessionOptions = {
  reason?: string;
};
