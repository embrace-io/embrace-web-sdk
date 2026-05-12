import type { DiagLogger } from '@opentelemetry/api';

export interface EmbraceUserManagerArgs {
  diag?: DiagLogger;
  storage?: Storage;
}

export const isUserId = (userId: unknown): userId is string =>
  typeof userId === 'string' && userId.length === 32;
