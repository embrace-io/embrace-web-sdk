import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../testUtils/index.ts';
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

  it('should return 1 if the counter could not be retrieved', () => {
    const storage = new FailingStorage();

    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);

    expect(diag.getWarnLogs()).to.deep.equal([
      'Failed to retrieve my-key from storage: ',
      'Failed to retrieve my-key from storage: ',
    ]);
  });
});
