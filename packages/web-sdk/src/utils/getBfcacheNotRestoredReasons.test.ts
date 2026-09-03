import * as chai from 'chai';
import * as sinon from 'sinon';
import { getBfcacheNotRestoredReasons } from './getBfcacheNotRestoredReasons.ts';

const { expect } = chai;

describe('getBfcacheNotRestoredReasons', () => {
  let spyEntries: sinon.SinonStub;

  beforeEach(() => {
    spyEntries = sinon.stub(window.performance, 'getEntriesByType');
  });

  afterEach(() => {
    spyEntries.restore();
  });

  it('should return the flattened reasons when the navigation was blocked from the back/forward cache', () => {
    spyEntries.withArgs('navigation').returns([
      {
        notRestoredReasons: {
          reasons: [{ reason: 'unload-listener' }, { reason: 'websocket' }],
        },
      },
    ]);

    expect(getBfcacheNotRestoredReasons()).to.deep.equal([
      'unload-listener',
      'websocket',
    ]);
  });

  it('should return undefined when the navigation was restored from the back/forward cache', () => {
    spyEntries.withArgs('navigation').returns([{ notRestoredReasons: null }]);

    expect(getBfcacheNotRestoredReasons()).to.be.undefined;
  });

  it('should return an empty array when reasons is an empty array', () => {
    spyEntries
      .withArgs('navigation')
      .returns([{ notRestoredReasons: { reasons: [] } }]);

    expect(getBfcacheNotRestoredReasons()).to.deep.equal([]);
  });

  it('should return undefined when there is no navigation entry', () => {
    spyEntries.withArgs('navigation').returns([]);

    expect(getBfcacheNotRestoredReasons()).to.be.undefined;
  });

  it('should return undefined when the engine does not report notRestoredReasons at all', () => {
    spyEntries.withArgs('navigation').returns([{}]);

    expect(getBfcacheNotRestoredReasons()).to.be.undefined;
  });
});
