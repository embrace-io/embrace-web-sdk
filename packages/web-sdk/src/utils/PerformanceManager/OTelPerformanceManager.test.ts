import type { HrTime } from '@opentelemetry/api';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  _resetPageShowMillisForTesting,
  OTelPerformanceManager,
  updatePageShowMillis,
} from './OTelPerformanceManager.ts';
import type { PerformanceClock } from './types.ts';

const { expect } = chai;

describe('OTelPerformanceManager', () => {
  let mockClock: PerformanceClock;
  let performanceManager: OTelPerformanceManager;

  beforeEach(() => {
    _resetPageShowMillisForTesting();
    mockClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
    };
    performanceManager = new OTelPerformanceManager(mockClock);
  });

  it('should calculate epochMillisFromZeroTime correctly', () => {
    const offset = 300;
    const result = performanceManager.epochMillisFromZeroTime(offset);
    expect(result).to.equal(1300); // timeOrigin (1000) + offset (300)
  });

  it('shifts epochMillisFromZeroTime by pageshow when page start is updated', () => {
    updatePageShowMillis(1500); // pageshow bumps page start to 1500
    // getZeroTime() = max(timeOrigin(1000) + activationStart(0), 1500) = 1500
    expect(performanceManager.epochMillisFromZeroTime(300)).to.equal(1800); // 1500 + 300
  });

  it('should get current time in milliseconds', () => {
    const result = performanceManager.getNowMillis();
    expect(result).to.equal(1500); // timeOrigin (1000) + now() (500)
  });

  it('shifts getNowMillis by pageshow when page start is updated', () => {
    updatePageShowMillis(1500); // pageshow bumps page start to 1500
    // getNowMillis() = getZeroTime() + now() = 1500 + 500 = 2000
    expect(performanceManager.getNowMillis()).to.equal(2000);
  });

  it('should get current time in HR time format', () => {
    const result = performanceManager.getNowHRTime();
    // HR time is [seconds, nanoseconds]
    expect(result[0]).to.equal(1); // 1 second
    expect(result[1]).to.equal(500000000); // 500ms = 500000000 nanoseconds
  });

  it('should handle zero offset', () => {
    const result = performanceManager.epochMillisFromZeroTime(0);
    expect(result).to.equal(1000); // timeOrigin (1000) + offset (0)
  });

  it('should get the milliseconds since a given HR time', () => {
    // HR time is [seconds, nanoseconds]
    const startTime: HrTime = [1, 100000000];
    expect(performanceManager.millisSinceHRTime(startTime)).to.equal(400);
  });

  it('should return originOffset unchanged from millisFromZeroTime', () => {
    expect(performanceManager.millisFromZeroTime(300)).to.equal(300);
    expect(performanceManager.millisFromZeroTime(0)).to.equal(0);
  });

  it('clamps millisSinceHRTime to 0 when the given time is after getNowMillis', () => {
    // nowMillis = 1500, so a future HrTime of 2000ms should clamp to 0
    const futureTime: HrTime = [2, 0]; // 2000ms
    expect(performanceManager.millisSinceHRTime(futureTime)).to.equal(0);
  });

  it('calculates elapsed time relative to effective page start after pageshow, clamping future HrTimes to 0', () => {
    // page start is bumped to 1800 via pageshow; now() = 1500 → getNowMillis = 1800 + 500 = 2300
    updatePageShowMillis(1800);
    // getNowMillis() = getZeroTime() + now() = 1800 + 500 = 2300
    // hrTimeToMilliseconds([1, 950000000]) = 1950 → 2300 - 1950 = 350, not clamped
    const beforeNow: HrTime = [1, 950000000]; // 1950ms
    expect(performanceManager.millisSinceHRTime(beforeNow)).to.equal(350);

    // an event whose HrTime exceeds getNowMillis clamps to 0
    const afterNow: HrTime = [2, 400000000]; // 2400ms > 2300ms
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

  it('returns pageshow epoch when updatePageShowMillis is called with a later value', () => {
    updatePageShowMillis(1500); // later than timeOrigin (1000) + activationStart (0)
    expect(performanceManager.getZeroTime()).to.equal(1500);
  });

  it('returns timeOrigin + activationStart when updatePageShowMillis is called with an earlier value', () => {
    updatePageShowMillis(500); // earlier than timeOrigin (1000) + activationStart (0)
    expect(performanceManager.getZeroTime()).to.equal(1000); // max wins
  });

  it('module-level state is shared across instances', () => {
    updatePageShowMillis(2000);
    const secondPerf = new OTelPerformanceManager(mockClock);
    expect(secondPerf.getZeroTime()).to.equal(2000);
  });
});
