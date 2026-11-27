import type {
  IncrementSessionPartCountsArgs,
  SessionPartCounters,
  SessionPartCounts,
} from '../../src/managers/EmbraceUserSessionManager/utils/index.ts';
import { LocalStorageSessionPartCounters } from '../../src/managers/EmbraceUserSessionManager/utils/index.ts';
import type { NamespacedStorage } from '../../src/utils/NamespacedStorage/index.ts';
import { InMemoryDiagLogger } from './InMemoryDiagLogger.ts';
import { setupTestStorage } from './setupTestStorage.ts';

/**
 * Increments the session part counters in the given storage, or in a fresh
 * in-memory one. `settled()` resolves with the counts handed out so far, once
 * the manager has applied them.
 */
export class InMemorySessionPartCounters implements SessionPartCounters {
  private readonly _counters: LocalStorageSessionPartCounters;
  private readonly _increments: Array<Promise<SessionPartCounts>> = [];

  public constructor(storage: NamespacedStorage = setupTestStorage()) {
    this._counters = new LocalStorageSessionPartCounters({
      storage,
      diag: new InMemoryDiagLogger(),
    });
  }

  public increment(
    args: IncrementSessionPartCountsArgs,
  ): Promise<SessionPartCounts> {
    const increment = this._counters.increment(args);

    this._increments.push(increment);

    return increment;
  }

  // The manager's handler is registered on each increment first, so it has
  // run once they've all been awaited here.
  public settled(): Promise<SessionPartCounts[]> {
    return Promise.all(this._increments);
  }
}
