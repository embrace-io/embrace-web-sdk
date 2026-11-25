import type { DiagLogger } from '@opentelemetry/api';
import type { NamespacedStorage } from './NamespacedStorage/index.ts';

// Reads a global counter shared across all tabs, 0 when it isn't stored.
export const getStoredCount = (
  storage: NamespacedStorage,
  key: string,
  diag: DiagLogger,
): number => {
  const value = storage.getItem(key);
  const number = value ? parseInt(value, 10) : 0;

  if (Number.isNaN(number)) {
    diag.warn(
      `Non-numeric value stored at ${key} (${String(value)}); resetting counter.`,
    );

    return 0;
  }

  return number;
};

// Increments and returns a global counter shared across all tabs, counting
// from `current` instead of the stored value when given.
// Race conditions are possible but acceptable for diagnostic use-cases
export const getIncrementedCount = (
  storage: NamespacedStorage,
  key: string,
  diag: DiagLogger,
  current?: number,
): number => {
  const number = (current ?? getStoredCount(storage, key, diag)) + 1;

  storage.setItem(key, number.toString());

  return number;
};
