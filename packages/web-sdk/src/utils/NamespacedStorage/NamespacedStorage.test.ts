import * as chai from 'chai';
import { InMemoryStorage } from '../../../tests/utils/index.ts';
import { NamespacedStorage } from './NamespacedStorage.ts';

const { expect } = chai;

describe('NamespacedStorage', () => {
  let inMemoryStorage: InMemoryStorage;

  beforeEach(() => {
    inMemoryStorage = new InMemoryStorage();
  });

  it('should set and get values using a prefix on the key', () => {
    const storage = new NamespacedStorage('prefix', inMemoryStorage);

    storage.setItem('key1', 'foo');
    storage.setItem('key2', 'bar');
    inMemoryStorage.setItem('key1', 'baz');
    inMemoryStorage.setItem('key3', 'bat');

    expect(storage.getItem('key1')).to.equal('foo');
    expect(storage.getItem('key2')).to.equal('bar');
    expect(storage.getItem('key3')).to.equal(null);

    expect(inMemoryStorage.getItem('key1')).to.equal('baz');
    expect(inMemoryStorage.getItem('prefix_key1')).to.equal('foo');
    expect(inMemoryStorage.getItem('key2')).to.equal(null);
    expect(inMemoryStorage.getItem('prefix_key2')).to.equal('bar');
    expect(inMemoryStorage.getItem('key3')).to.equal('bat');
    expect(inMemoryStorage.getItem('prefix_key3')).to.equal(null);
  });

  it('should remove items using a prefix on the key', () => {
    const storage = new NamespacedStorage('prefix', inMemoryStorage);

    storage.setItem('key1', 'foo');
    inMemoryStorage.setItem('key1', 'baz');
    inMemoryStorage.setItem('key2', 'bat');

    storage.removeItem('key1');
    storage.removeItem('key2');

    expect(storage.getItem('key1')).to.equal(null);
    expect(storage.getItem('key2')).to.equal(null);
    expect(inMemoryStorage.getItem('key1')).to.equal('baz');
    expect(inMemoryStorage.getItem('prefix_key1')).to.equal(null);
    expect(inMemoryStorage.getItem('key2')).to.equal('bat');
    expect(inMemoryStorage.getItem('prefix_key2')).to.equal(null);
  });

  it('should return keys that match the prefix', () => {
    const storage = new NamespacedStorage('prefix', inMemoryStorage);

    storage.setItem('key1', 'foo');
    inMemoryStorage.setItem('key3', 'baz');
    storage.setItem('key2', 'bar');
    inMemoryStorage.setItem('key4', 'bat');

    expect(storage.length).to.equal(2);
    expect(storage.key(0)).to.equal('key1');
    expect(storage.key(1)).to.equal('key2');

    expect(inMemoryStorage.length).to.equal(4);
    expect(inMemoryStorage.key(0)).to.equal('prefix_key1');
    expect(inMemoryStorage.key(1)).to.equal('key3');
    expect(inMemoryStorage.key(2)).to.equal('prefix_key2');
    expect(inMemoryStorage.key(3)).to.equal('key4');
  });

  it('should clear keys that match the prefix', () => {
    const storage = new NamespacedStorage('prefix', inMemoryStorage);

    storage.setItem('key1', 'foo');
    inMemoryStorage.setItem('key3', 'baz');
    storage.setItem('key2', 'bar');
    inMemoryStorage.setItem('key4', 'bat');

    storage.clear();

    expect(storage.length).to.equal(0);
    expect(storage.key(0)).to.equal(null);
    expect(storage.key(1)).to.equal(null);
    expect(storage.getItem('key1')).to.equal(null);
    expect(storage.getItem('key2')).to.equal(null);

    expect(inMemoryStorage.length).to.equal(2);
    expect(inMemoryStorage.key(0)).to.equal('key3');
    expect(inMemoryStorage.key(1)).to.equal('key4');
  });

  it('should expose the underlying storage event key for namespaced keys', () => {
    const storage = new NamespacedStorage('app123', inMemoryStorage);
    expect(storage.getStorageEventKey('embrace_user_session_state')).to.equal(
      'app123_embrace_user_session_state',
    );
  });

  it('should return all logical keys via keys() in a single pass', () => {
    const storage = new NamespacedStorage('prefix', inMemoryStorage);
    storage.setItem('key1', 'foo');
    inMemoryStorage.setItem('unrelated', 'baz');
    storage.setItem('key2', 'bar');

    expect(storage.keys()).to.deep.equal(['key1', 'key2']);
  });
});
