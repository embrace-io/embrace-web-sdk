import * as chai from 'chai';
import * as sinon from 'sinon';
import { getNonBaselineNavigationTiming } from './getNonBaselineNavigationTiming.ts';

const { expect } = chai;

describe('getNonBaselineNavigationTiming', () => {
  let spyEntries: sinon.SinonStub;

  beforeEach(() => {
    spyEntries = sinon.stub(window.performance, 'getEntriesByType');
  });

  afterEach(() => {
    spyEntries.restore();
  });

  it('should return the navigation entry when one is available', () => {
    const entry = { name: 'http://localhost/' };
    spyEntries.withArgs('navigation').returns([entry]);

    expect(getNonBaselineNavigationTiming()).to.equal(entry);
  });

  it('should return undefined when there is no navigation entry', () => {
    spyEntries.withArgs('navigation').returns([]);

    expect(getNonBaselineNavigationTiming()).to.be.undefined;
  });
});
