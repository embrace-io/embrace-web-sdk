import type { DiagLogger } from '@opentelemetry/api';
import type { SafeStorageLike } from './SafeStorage/index.ts';

// Race conditions are possible across tabs but acceptable for diagnostic
// use-cases. On a failed write the next read will see the prior value.
export const getIncrementedCount = (
  storage: SafeStorageLike,
  key: string,
  diag: DiagLogger,
): number => {
  const value = storage.read(key);
  let number = value ? parseInt(value, 10) : 0;
  if (Number.isNaN(number)) {
    diag.warn(
      `Non-numeric value stored at ${key} (${String(value)}); resetting counter.`,
    );
    number = 0;
  }
  number++;
  storage.write(key, number.toString());
  return number;
};
