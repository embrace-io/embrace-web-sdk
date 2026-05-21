import { NamespacedStorage } from '../../src/utils/NamespacedStorage/index.ts';
import { InMemoryStorage } from './InMemoryStorage.ts';

/**
 * setupTestStorage is a utility function that constructs an isolated
 * `NamespacedStorage` backed by a fresh `InMemoryStorage`. Use it when a
 * test needs to construct a manager that requires storage but does not
 * exercise storage state directly.
 */
export const setupTestStorage = (): NamespacedStorage =>
  new NamespacedStorage({ storage: new InMemoryStorage() });
