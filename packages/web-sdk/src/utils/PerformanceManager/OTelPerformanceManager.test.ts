import type { HrTime } from '@opentelemetry/api';
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

  it('should get current time in HR time format', () => {
    const result = performanceManager.getNowHRTime();
    // HR time is [seconds, nanoseconds]
    expect(result[0]).to.equal(1); // 1 second
    expect(result[1]).to.equal(500000000); // 500ms = 500000000 nanoseconds
  });

  it('should handle zero offset', () => {
    const result = performanceManager.epochMillisFromOrigin(0);
    expect(result).to.equal(1000); // timeOrigin (1000) + offset (0)
  });

  it('should get the milliseconds since a given HR time', () => {
    // HR time is [seconds, nanoseconds]
    const startTime: HrTime = [1, 100000000];
    expect(performanceManager.millisSinceHRTime(startTime)).to.equal(400);
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

  it('clamps millisSinceHRTime to 0 when the given time is after getNowMillis', () => {
    // nowMillis = 1500, so a future HrTime of 2000ms should clamp to 0
    const futureTime: HrTime = [2, 0]; // 2000ms
    expect(performanceManager.millisSinceHRTime(futureTime)).to.equal(0);
  });

  it('millisSinceHRTime is unaffected by pageshow, since getNowMillis reports true wall-clock now', () => {
    updateZeroTimeMillis(1800); // shifts zero time, but not timeOrigin or "now"
    // getNowMillis() = timeOrigin (1000) + now() (500) = 1500
    const beforeNow: HrTime = [1, 100000000]; // 1100ms
    expect(performanceManager.millisSinceHRTime(beforeNow)).to.equal(400); // 1500 - 1100

    const afterNow: HrTime = [2, 0]; // 2000ms > 1500ms
    expect(performanceManager.millisSinceHRTime(afterNow)).to.equal(0);
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

  it('module-level state is shared across instances', () => {
    updateZeroTimeMillis(2000);
    const secondPerf = new OTelPerformanceManager(mockClock);
    expect(secondPerf.getZeroTime()).to.equal(2000);
  });
});
