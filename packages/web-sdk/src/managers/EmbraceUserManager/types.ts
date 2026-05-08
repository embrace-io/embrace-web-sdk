import type { DiagLogger } from '@opentelemetry/api';
import type { EmbraceStorage } from '../../utils/index.ts';

export interface EmbraceUserManagerArgs {
  diag?: DiagLogger;
  storage?: EmbraceStorage;
}

export const isUserId = (userId: unknown): userId is string =>
  typeof userId === 'string' && userId.length === 32;
