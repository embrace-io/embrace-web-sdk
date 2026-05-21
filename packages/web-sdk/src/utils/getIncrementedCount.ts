import type { DiagLogger } from '@opentelemetry/api';
import type { NamespacedStorage } from './NamespacedStorage/index.ts';

// Increments and returns a global counter shared across all tabs
// Race conditions are possible but acceptable for diagnostic use-cases
export const getIncrementedCount = (
  storage: NamespacedStorage,
  key: string,
  diag: DiagLogger,
): number => {
  const value = storage.getItem(key);
  let number = value ? parseInt(value, 10) : 0;
  if (Number.isNaN(number)) {
    diag.warn(
      `Non-numeric value stored at ${key} (${String(value)}); resetting counter.`,
    );
    number = 0;
  }
  number++;
  storage.setItem(key, number.toString());
  return number;
};
