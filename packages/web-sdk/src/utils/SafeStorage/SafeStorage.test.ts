import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../../tests/utils/index.ts';
import { NamespacedStorage } from '../NamespacedStorage/NamespacedStorage.ts';
import { SafeStorage } from './SafeStorage.ts';

const { expect } = chai;

describe('SafeStorage', () => {
  let diag: InMemoryDiagLogger;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
  });

  it('reads and writes values when storage is healthy', () => {
    const storage = new SafeStorage(new InMemoryStorage(), diag);

    expect(storage.write('key', 'value')).to.equal(true);
    expect(storage.read('key')).to.equal('value');
    expect(storage.has('key')).to.equal(true);
    expect(storage.isDisabled()).to.equal(false);
    expect(diag.getErrorLogs()).to.have.lengthOf(0);
    expect(diag.getWarnLogs()).to.have.lengthOf(0);
  });

  it('returns null and warns when read fails', () => {
    const storage = new SafeStorage(new FailingStorage(), diag);

    expect(storage.read('key')).to.equal(null);
    expect(storage.has('key')).to.equal(false);
    expect(diag.getWarnLogs()).to.have.lengthOf(2);
    expect(diag.getErrorLogs()).to.have.lengthOf(0);
    expect(storage.isDisabled()).to.equal(false);
  });

  it('returns null on read miss without warning', () => {
    const storage = new SafeStorage(new InMemoryStorage(), diag);

    expect(storage.read('missing')).to.equal(null);
    expect(diag.getWarnLogs()).to.have.lengthOf(0);
  });

  it('flips to disabled and emits a single error on first write failure', () => {
    const storage = new SafeStorage(new FailingStorage(), diag);

    expect(storage.write('a', '1')).to.equal(false);
    expect(storage.isDisabled()).to.equal(true);
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('Storage write failed');
    expect(diag.getErrorLogs()[0]).to.contain('falling back to in-memory');
  });

  it('silences subsequent write failures after disable', () => {
    const storage = new SafeStorage(new FailingStorage(), diag);

    expect(storage.write('a', '1')).to.equal(false);
    expect(storage.write('b', '2')).to.equal(false);
    expect(storage.write('c', '3')).to.equal(false);
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
  });

  it('returns true on successful remove and warns on failure', () => {
    const inMemoryStorage = new InMemoryStorage();
    inMemoryStorage.setItem('k', 'v');
    const safeMem = new SafeStorage(inMemoryStorage, diag);
    expect(safeMem.remove('k')).to.equal(true);
    expect(safeMem.read('k')).to.equal(null);

    const safeFailing = new SafeStorage(new FailingStorage(), diag);
    expect(safeFailing.remove('k')).to.equal(false);
    expect(
      diag.getWarnLogs().some((m) => m.includes('Failed to remove')),
    ).to.equal(true);
    expect(safeFailing.isDisabled()).to.equal(false);
  });

  it('keys() returns all underlying keys when storage is healthy', () => {
    const inMemoryStorage = new InMemoryStorage();
    inMemoryStorage.setItem('one', '1');
    inMemoryStorage.setItem('two', '2');
    const storage = new SafeStorage(inMemoryStorage, diag);

    expect(storage.keys()).to.deep.equal(['one', 'two']);
  });

  it('keys() returns empty array when length throws', () => {
    const storage = new SafeStorage(new FailingStorage(), diag);

    expect(storage.keys()).to.deep.equal([]);
    expect(diag.getWarnLogs()).to.have.lengthOf(1);
  });

  it('keys() skips poisoned indices', () => {
    let callCount = 0;
    const poisoned: Storage = {
      get length() {
        return 3;
      },
      clear() {
        return;
      },
      getItem() {
        return null;
      },
      key(index: number) {
        callCount++;
        if (index === 1) {
          throw new Error('poisoned');
        }
        return `k${index.toString()}`;
      },
      removeItem() {
        return;
      },
      setItem() {
        return;
      },
    };
    const storage = new SafeStorage(poisoned, diag);

    expect(storage.keys()).to.deep.equal(['k0', 'k2']);
    expect(callCount).to.equal(3);
    expect(diag.getWarnLogs()).to.have.lengthOf(1);
  });

  it('getStorageEventKey returns the namespaced key when wrapping NamespacedStorage', () => {
    const storage = new SafeStorage(
      new NamespacedStorage('app123', new InMemoryStorage()),
      diag,
    );

    expect(storage.getStorageEventKey('embrace_user_session_state')).to.equal(
      'app123_embrace_user_session_state',
    );
  });

  it('getStorageEventKey returns the logical key when wrapping plain storage', () => {
    const storage = new SafeStorage(new InMemoryStorage(), diag);

    expect(storage.getStorageEventKey('embrace_user_session_state')).to.equal(
      'embrace_user_session_state',
    );
  });
});
