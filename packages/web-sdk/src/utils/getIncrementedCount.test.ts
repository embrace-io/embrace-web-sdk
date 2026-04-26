import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../tests/utils/index.ts';
import { getIncrementedCount } from './getIncrementedCount.ts';

const { expect } = chai;

describe('getIncrementedCount', () => {
  let diag: InMemoryDiagLogger;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
  });

  it('should return an incremented count after each call', () => {
    const storage = new InMemoryStorage();

    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(2);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(3);

    storage.clear();
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
  });

  it('should return 0 when storage is unavailable', () => {
    const storage = new FailingStorage();

    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(0);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(0);

    expect(diag.getWarnLogs()).to.deep.equal([
      'Failed to retrieve my-key from storage: ',
      'Failed to retrieve my-key from storage: ',
    ]);
  });
});
