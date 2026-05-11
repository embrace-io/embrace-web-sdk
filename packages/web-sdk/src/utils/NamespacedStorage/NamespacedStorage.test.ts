import type { DiagLogger } from '@opentelemetry/api';
import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../../tests/utils/index.ts';
import { NamespacedStorage } from './NamespacedStorage.ts';

const { expect } = chai;

describe('NamespacedStorage', () => {
  let diag: InMemoryDiagLogger;
  let inMemoryStorage: InMemoryStorage;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
    inMemoryStorage = new InMemoryStorage();
  });

  describe('without namespace', () => {
    it('reads and writes raw keys', () => {
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
        diag,
      });

      expect(storage.setItem('key', 'value')).to.equal(true);

      expect(storage.getItem('key')).to.equal('value');
      expect(inMemoryStorage.getItem('key')).to.equal('value');
    });

    it('keys() returns all underlying keys', () => {
      inMemoryStorage.setItem('one', '1');
      inMemoryStorage.setItem('two', '2');
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
        diag,
      });

      expect(storage.keys()).to.deep.equal(['one', 'two']);
    });

    it('length and key(i) reflect the underlying storage when un-namespaced', () => {
      inMemoryStorage.setItem('one', '1');
      inMemoryStorage.setItem('two', '2');
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
        diag,
      });

      expect(storage.length).to.equal(2);
      expect([storage.key(0), storage.key(1)].sort()).to.deep.equal([
        'one',
        'two',
      ]);
      expect(storage.key(2)).to.equal(null);
    });

    it('treats an empty-string namespace as no namespace', () => {
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
        namespace: '',
        diag,
      });

      storage.setItem('key1', 'foo');
      inMemoryStorage.setItem('key2', 'bar');

      expect(storage.getItem('key1')).to.equal('foo');
      expect(storage.getItem('key2')).to.equal('bar');
      expect(inMemoryStorage.getItem('key1')).to.equal('foo');
      expect(inMemoryStorage.getItem('_key1')).to.equal(null);
    });

    it('clear() removes every key from the underlying storage', () => {
      inMemoryStorage.setItem('one', '1');
      inMemoryStorage.setItem('two', '2');
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
        diag,
      });

      expect(storage.clear()).to.equal(true);

      expect(storage.keys()).to.deep.equal([]);
      expect(inMemoryStorage.length).to.equal(0);
    });
  });

  describe('with namespace', () => {
    it('prefixes physical keys but exposes logical keys to callers', () => {
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
        namespace: 'prefix',
        diag,
      });

      storage.setItem('key1', 'foo');
      storage.setItem('key2', 'bar');
      inMemoryStorage.setItem('key1', 'baz');
      inMemoryStorage.setItem('key3', 'bat');

      expect(storage.getItem('key1')).to.equal('foo');
      expect(storage.getItem('key2')).to.equal('bar');
      expect(storage.getItem('key3')).to.equal(null);

      expect(inMemoryStorage.getItem('key1')).to.equal('baz');
      expect(inMemoryStorage.getItem('prefix_key1')).to.equal('foo');
      expect(inMemoryStorage.getItem('prefix_key2')).to.equal('bar');
      expect(inMemoryStorage.getItem('key3')).to.equal('bat');
    });

    it('removeItem deletes only the namespaced physical key', () => {
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
        namespace: 'prefix',
        diag,
      });

      storage.setItem('key1', 'foo');
      inMemoryStorage.setItem('key1', 'baz');

      expect(storage.removeItem('key1')).to.equal(true);

      expect(storage.getItem('key1')).to.equal(null);
      expect(inMemoryStorage.getItem('key1')).to.equal('baz');
      expect(inMemoryStorage.getItem('prefix_key1')).to.equal(null);
    });

    it('keys(), key(i), and length reflect the namespaced view', () => {
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
        namespace: 'prefix',
        diag,
      });

      storage.setItem('key1', 'foo');
      inMemoryStorage.setItem('key3', 'baz');
      storage.setItem('key2', 'bar');
      inMemoryStorage.setItem('key4', 'bat');

      expect(storage.keys()).to.deep.equal(['key1', 'key2']);
      expect(storage.length).to.equal(2);
      expect(storage.key(0)).to.equal('key1');
      expect(storage.key(1)).to.equal('key2');
      expect(storage.key(2)).to.equal(null);

      expect(inMemoryStorage.length).to.equal(4);
    });

    it('clear() only removes namespaced keys, leaving foreign keys intact', () => {
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
        namespace: 'prefix',
        diag,
      });

      storage.setItem('key1', 'foo');
      inMemoryStorage.setItem('key3', 'baz');
      storage.setItem('key2', 'bar');
      inMemoryStorage.setItem('key4', 'bat');

      expect(storage.clear()).to.equal(true);

      expect(storage.keys()).to.deep.equal([]);
      expect(inMemoryStorage.length).to.equal(2);
      expect(inMemoryStorage.getItem('key3')).to.equal('baz');
      expect(inMemoryStorage.getItem('key4')).to.equal('bat');
    });

    it('preserves an empty-string logical key without coercing to null', () => {
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
        namespace: 'prefix',
        diag,
      });

      storage.setItem('', 'empty-key-value');

      expect(inMemoryStorage.getItem('prefix_')).to.equal('empty-key-value');
      expect(storage.getItem('')).to.equal('empty-key-value');
      expect(storage.key(0)).to.equal('');
      expect(storage.keys()).to.deep.equal(['']);
    });
  });

  describe('error handling', () => {
    it('returns null and warns when getItem throws', () => {
      const storage = new NamespacedStorage({
        storage: new FailingStorage(),
        namespace: 'prefix',
        diag,
      });

      expect(storage.getItem('foo')).to.equal(null);
      expect(diag.getWarnLogs()).to.have.lengthOf(1);
      expect(diag.getWarnLogs()[0]).to.contain('foo');
      expect(diag.getErrorLogs()).to.have.lengthOf(0);
    });

    it('returns null on read miss without warning', () => {
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
        diag,
      });

      expect(storage.getItem('missing')).to.equal(null);
      expect(diag.getWarnLogs()).to.have.lengthOf(0);
    });

    it('returns empty keys/length and warns when storage.length throws', () => {
      const storage = new NamespacedStorage({
        storage: new FailingStorage(),
        namespace: 'prefix',
        diag,
      });

      expect(storage.length).to.equal(0);
      expect(storage.keys()).to.deep.equal([]);
      expect(storage.key(0)).to.equal(null);
      expect(diag.getWarnLogs().some((m) => m.includes('length'))).to.equal(
        true,
      );
    });

    it('removeItem warns on failure without disabling writes', () => {
      const storage = new NamespacedStorage({
        storage: new FailingStorage(),
        namespace: 'prefix',
        diag,
      });

      expect(storage.removeItem('foo')).to.equal(false);

      expect(diag.getWarnLogs().some((m) => m.includes('prefix_foo'))).to.equal(
        true,
      );
      expect(diag.getErrorLogs()).to.have.lengthOf(0);
    });

    it('flips to disabled and emits a single error on first setItem failure', () => {
      let setCalls = 0;
      const failingWrites: Storage = {
        get length() {
          return 0;
        },
        clear: () => undefined,
        getItem: () => null,
        key: () => null,
        removeItem: () => undefined,
        setItem: () => {
          setCalls++;
          throw new Error('QuotaExceeded');
        },
      };
      const storage = new NamespacedStorage({
        storage: failingWrites,
        namespace: 'prefix',
        diag,
      });

      expect(storage.setItem('a', '1')).to.equal(false);
      expect(storage.setItem('b', '2')).to.equal(false);
      expect(storage.setItem('c', '3')).to.equal(false);

      expect(setCalls).to.equal(1);
      expect(diag.getErrorLogs()).to.have.lengthOf(1);
      expect(diag.getErrorLogs()[0]).to.contain('writes disabled');
    });

    it('disables writes when setItem throws a non-Error value', () => {
      const nonErrorThrowingStorage: Storage = {
        get length() {
          return 0;
        },
        clear: () => undefined,
        getItem: () => null,
        key: () => null,
        removeItem: () => undefined,
        // eslint-disable-next-line no-throw-literal
        setItem: () => {
          throw 'quota exceeded';
        },
      };
      const storage = new NamespacedStorage({
        storage: nonErrorThrowingStorage,
        diag,
      });

      expect(storage.setItem('a', '1')).to.equal(false);
      expect(storage.setItem('b', '2')).to.equal(false);

      expect(diag.getErrorLogs()).to.have.lengthOf(1);
      expect(diag.getErrorLogs()[0]).to.contain('writes disabled');
    });

    it('keeps reads, removes, and clears working after writes are disabled', () => {
      inMemoryStorage.setItem('prefix_kept', 'value');
      inMemoryStorage.setItem('prefix_removed', 'gone');

      let allowWrites = true;
      const flakyStorage: Storage = {
        get length() {
          return inMemoryStorage.length;
        },
        clear: () => {
          inMemoryStorage.clear();
        },
        getItem: (k) => inMemoryStorage.getItem(k),
        key: (i) => inMemoryStorage.key(i),
        removeItem: (k) => {
          inMemoryStorage.removeItem(k);
        },
        setItem: (k, v) => {
          if (!allowWrites) {
            throw new Error('QuotaExceeded');
          }
          inMemoryStorage.setItem(k, v);
        },
      };
      const storage = new NamespacedStorage({
        storage: flakyStorage,
        namespace: 'prefix',
        diag,
      });

      allowWrites = false;
      storage.setItem('attempt', 'value');
      storage.setItem('also-attempt', 'value');

      expect(storage.getItem('kept')).to.equal('value');

      storage.removeItem('removed');
      expect(storage.getItem('removed')).to.equal(null);

      inMemoryStorage.setItem('prefix_for_clear', 'value');
      storage.clear();
      expect(storage.length).to.equal(0);

      expect(diag.getErrorLogs()).to.have.lengthOf(1);
      expect(diag.getWarnLogs()).to.have.lengthOf(0);
    });

    it('continues iterating when storage.key(i) throws for some indices', () => {
      let callCount = 0;
      const partialKeyFail: Storage = {
        get length() {
          return 3;
        },
        clear: () => undefined,
        getItem: () => null,
        key: (i) => {
          callCount++;
          if (i === 0) return 'prefix_a';
          if (i === 2) return 'prefix_b';
          throw new Error('reading-prevented');
        },
        removeItem: () => undefined,
        setItem: () => undefined,
      };
      const storage = new NamespacedStorage({
        storage: partialKeyFail,
        namespace: 'prefix',
        diag,
      });

      expect(storage.keys()).to.deep.equal(['a', 'b']);
      expect(callCount).to.equal(3);
      expect(diag.getWarnLogs()).to.have.lengthOf(1);
      expect(diag.getWarnLogs()[0]).to.contain('index 1');
    });

    it('logs only the error name on setItem failure, not the value', () => {
      const value = 'sensitive-payload';
      const errorCalls: unknown[][] = [];
      const captureLogger: DiagLogger = {
        debug: () => undefined,
        error: (...callArgs) => {
          errorCalls.push(callArgs);
        },
        info: () => undefined,
        verbose: () => undefined,
        warn: () => undefined,
      };
      const failingWrites: Storage = {
        get length() {
          return 0;
        },
        clear: () => undefined,
        getItem: () => null,
        key: () => null,
        removeItem: () => undefined,
        setItem: () => {
          const e = new Error(`quota exceeded while writing ${value}`);
          e.name = 'QuotaExceededError';
          throw e;
        },
      };
      const storage = new NamespacedStorage({
        storage: failingWrites,
        namespace: 'prefix',
        diag: captureLogger,
      });

      storage.setItem('k', value);

      expect(errorCalls).to.have.lengthOf(1);
      const flat = errorCalls[0].map(String).join(' ');
      expect(flat).to.contain('QuotaExceededError');
      expect(flat).to.not.contain(value);
    });

    it('clear() returns false when an underlying remove fails, but continues iterating', () => {
      inMemoryStorage.setItem('prefix_a', '1');
      inMemoryStorage.setItem('prefix_b', '2');
      let removeCalls = 0;
      const removeFails: Storage = {
        get length() {
          return inMemoryStorage.length;
        },
        clear: () => {
          inMemoryStorage.clear();
        },
        getItem: (k) => inMemoryStorage.getItem(k),
        key: (i) => inMemoryStorage.key(i),
        removeItem: () => {
          removeCalls++;
          throw new Error('locked');
        },
        setItem: (k, v) => {
          inMemoryStorage.setItem(k, v);
        },
      };
      const storage = new NamespacedStorage({
        storage: removeFails,
        namespace: 'prefix',
        diag,
      });

      expect(storage.clear()).to.equal(false);
      expect(removeCalls).to.equal(2);
      expect(diag.getErrorLogs()).to.have.lengthOf(0);
      expect(diag.getWarnLogs()).to.have.lengthOf(2);
      expect(diag.getWarnLogs().every((m) => m.includes('prefix_'))).to.equal(
        true,
      );
    });
  });
});
