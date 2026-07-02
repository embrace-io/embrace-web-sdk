import type { DiagLogger } from '@opentelemetry/api';
import type { NamespacedStorage } from '../../utils/NamespacedStorage/NamespacedStorage.ts';

export interface EmbraceUserManagerArgs {
  diag?: DiagLogger;
  storage: NamespacedStorage;
}

export const isUserId = (userId: unknown): userId is string =>
  typeof userId === 'string' && userId.length === 32;
