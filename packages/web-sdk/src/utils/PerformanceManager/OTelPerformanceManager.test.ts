import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  _resetZeroTimeMillisForTesting,
  OTelPerformanceManager,
  updateZeroTimeMillis,
} from './OTelPerformanceManager.ts';
import type { PerformanceClock } from './types.ts';

const { expect } = chai;

describe('OTelPerformanceManager', () => {
  let mockClock: PerformanceClock;
  let performanceManager: OTelPerformanceManager;

  beforeEach(() => {
    _resetZeroTimeMillisForTesting();
    mockClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
    };
    performanceManager = new OTelPerformanceManager(mockClock);
  });

  it('should calculate epochMillisFromOrigin correctly', () => {
    const offset = 300;
    const result = performanceManager.epochMillisFromOrigin(offset);
    expect(result).to.equal(1300); // timeOrigin (1000) + offset (300)
  });

  it('is unaffected by pageshow, since originOffset is already timeOrigin-relative', () => {
    updateZeroTimeMillis(1500); // pageshow bumps zero time, but not timeOrigin
    expect(performanceManager.epochMillisFromOrigin(300)).to.equal(1300); // timeOrigin (1000) + offset (300)
  });

  it('should get current time in milliseconds', () => {
    const result = performanceManager.getNowMillis();
    expect(result).to.equal(1500); // timeOrigin (1000) + now() (500)
  });

  it('is unaffected by pageshow, since it reports true wall-clock time', () => {
    updateZeroTimeMillis(1500); // pageshow bumps zero time, but not "now"
    // getNowMillis() = timeOrigin (1000) + now() (500) = 1500
    expect(performanceManager.getNowMillis()).to.equal(1500);
  });

  it('should handle zero offset', () => {
    const result = performanceManager.epochMillisFromOrigin(0);
    expect(result).to.equal(1000); // timeOrigin (1000) + offset (0)
  });

  it('should return originOffset unchanged from millisFromZeroTime when zero time equals timeOrigin', () => {
    expect(performanceManager.millisFromZeroTime(300)).to.equal(300);
    expect(performanceManager.millisFromZeroTime(0)).to.equal(0);
  });

  it('rebases millisFromZeroTime onto activationStart on prerendered pages', () => {
    const clockWithActivation: PerformanceClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
      getEntriesByType: sinon
        .stub()
        .returns([{ activationStart: 200 } as PerformanceNavigationTiming]),
    };
    const perf = new OTelPerformanceManager(clockWithActivation);
    // zero time = timeOrigin (1000) + activationStart (200) = 1200, a 200ms gap from timeOrigin
    expect(perf.millisFromZeroTime(500)).to.equal(300); // 500 - 200
  });

  it('clamps millisFromZeroTime to 0 for offsets before activationStart', () => {
    const clockWithActivation: PerformanceClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
      getEntriesByType: sinon
        .stub()
        .returns([{ activationStart: 200 } as PerformanceNavigationTiming]),
    };
    const perf = new OTelPerformanceManager(clockWithActivation);
    expect(perf.millisFromZeroTime(100)).to.equal(0); // 100 - 200 clamped to 0
  });

  it('rebases millisFromZeroTime onto the pageshow gap after a bfcache restore', () => {
    updateZeroTimeMillis(1800); // gap from timeOrigin (1000) is 800ms
    expect(performanceManager.millisFromZeroTime(1000)).to.equal(200); // 1000 - 800
  });

  it('clamps millisFromZeroTime to 0 for offsets before the bfcache restore', () => {
    updateZeroTimeMillis(1800); // gap from timeOrigin (1000) is 800ms
    expect(performanceManager.millisFromZeroTime(500)).to.equal(0); // 500 - 800 clamped to 0
  });

  it('returns timeOrigin when clock has no getEntriesByType (activationStart = 0)', () => {
    expect(performanceManager.getZeroTime()).to.equal(1000); // timeOrigin (1000) + activationStart (0)
  });

  it('returns timeOrigin when getEntriesByType returns an empty array', () => {
    const clockWithEmptyNav: PerformanceClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
      getEntriesByType: sinon.stub().returns([]),
    };
    const perf = new OTelPerformanceManager(clockWithEmptyNav);
    expect(perf.getZeroTime()).to.equal(1000);
  });

  it('returns timeOrigin + activationStart when nav entry has nonzero activationStart', () => {
    const clockWithActivation: PerformanceClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
      getEntriesByType: sinon
        .stub()
        .returns([{ activationStart: 200 } as PerformanceNavigationTiming]),
    };
    const perf = new OTelPerformanceManager(clockWithActivation);
    expect(perf.getZeroTime()).to.equal(1200); // timeOrigin (1000) + activationStart (200)
  });

  it('returns pageshow epoch when updateZeroTimeMillis is called with a later value', () => {
    updateZeroTimeMillis(1500); // later than timeOrigin (1000) + activationStart (0)
    expect(performanceManager.getZeroTime()).to.equal(1500);
  });

  it('returns timeOrigin + activationStart when updateZeroTimeMillis is called with an earlier value', () => {
    updateZeroTimeMillis(500); // earlier than timeOrigin (1000) + activationStart (0)
    expect(performanceManager.getZeroTime()).to.equal(1000); // max wins
  });

  it('exposes the navigation entry off its clock', () => {
    const navigation = { activationStart: 200 } as PerformanceNavigationTiming;
    const clockWithNavigation: PerformanceClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
      getEntriesByType: sinon.stub().returns([navigation]),
    };
    const perf = new OTelPerformanceManager(clockWithNavigation);
    expect(perf.getNavigationEntry()).to.equal(navigation);
  });

  it('returns null from getNavigationEntry when the clock reports none', () => {
    expect(performanceManager.getNavigationEntry()).to.equal(null);
  });

  it('module-level state is shared across instances', () => {
    updateZeroTimeMillis(2000);
    const secondPerf = new OTelPerformanceManager(mockClock);
    expect(secondPerf.getZeroTime()).to.equal(2000);
  });
});
