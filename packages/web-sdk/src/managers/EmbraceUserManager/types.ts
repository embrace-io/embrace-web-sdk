import type { DiagLogger } from '@opentelemetry/api';
import type { SafeStorageLike } from '../../utils/index.ts';

export interface EmbraceUserManagerArgs {
  diag?: DiagLogger;
  storage?: SafeStorageLike;
}

export const isUserId = (userId: unknown): userId is string =>
  typeof userId === 'string' && userId.length === 32;
