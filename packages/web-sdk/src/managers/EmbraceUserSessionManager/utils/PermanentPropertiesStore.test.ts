import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../../../tests/utils/index.ts';
import { NamespacedStorage } from '../../../utils/index.ts';
import { PermanentPropertiesStore } from './PermanentPropertiesStore.ts';

const { expect } = chai;

const PROPERTIES_KEY = 'embrace_permanent_properties';

describe('PermanentPropertiesStore', () => {
  let diag: InMemoryDiagLogger;
  let backing: InMemoryStorage;
  let storage: NamespacedStorage;
  let store: PermanentPropertiesStore;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
    backing = new InMemoryStorage();
    storage = new NamespacedStorage({ storage: backing, diag });
    store = new PermanentPropertiesStore({ storage, diag });
  });

  it('returns no properties when nothing is stored', () => {
    expect(store.read()).to.deep.equal({});
  });

  it('writes the properties to storage and reads them back', () => {
    expect(store.write({ plan: 'pro' })).to.equal(true);

    expect(store.read()).to.deep.equal({ plan: 'pro' });
    expect(JSON.parse(backing.getItem(PROPERTIES_KEY) as string)).to.deep.equal(
      { plan: 'pro' },
    );
  });

  it('removes the stored value once no properties are left', () => {
    store.write({ plan: 'pro' });

    store.write({});

    void expect(backing.getItem(PROPERTIES_KEY)).to.be.null;
  });

  it('reads properties another tab wrote', () => {
    const otherTab = new PermanentPropertiesStore({
      storage: new NamespacedStorage({ storage: backing, diag }),
      diag,
    });

    otherTab.write({ plan: 'pro' });

    expect(store.read()).to.deep.equal({ plan: 'pro' });
  });

  it('drops entries whose value is not a string', () => {
    backing.setItem(
      PROPERTIES_KEY,
      JSON.stringify({ plan: 'pro', count: 3, flag: null }),
    );

    expect(store.read()).to.deep.equal({ plan: 'pro' });
  });

  it('discards a corrupt stored value', () => {
    backing.setItem(PROPERTIES_KEY, '{not json');

    expect(store.read()).to.deep.equal({});
    void expect(backing.getItem(PROPERTIES_KEY)).to.be.null;
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('corrupt');
  });

  it('discards a stored value that is not a plain object', () => {
    backing.setItem(PROPERTIES_KEY, JSON.stringify(['plan', 'pro']));

    expect(store.read()).to.deep.equal({});
    void expect(backing.getItem(PROPERTIES_KEY)).to.be.null;
  });

  it('returns false when storage writes fail', () => {
    const failingStore = new PermanentPropertiesStore({
      storage: new NamespacedStorage({ storage: new FailingStorage(), diag }),
      diag,
    });

    expect(failingStore.write({ plan: 'pro' })).to.equal(false);
  });
});
