import type { DiagLogger } from '@opentelemetry/api';

// Increments and returns a global counter shared across all tabs
// Race conditions are possible but acceptable for diagnostic use-cases
export const getIncrementedCount = (
  storage: Storage,
  key: string,
  diag: DiagLogger
) => {
  try {
    const value = storage.getItem(key);
    let number = value ? parseInt(value, 10) : 0;
    number++;
    storage.setItem(key, number.toString());
    return number;
  } catch (e) {
    diag.warn(`Failed to retrieve ${key} from storage: `, e);
    return 1;
  }
};
