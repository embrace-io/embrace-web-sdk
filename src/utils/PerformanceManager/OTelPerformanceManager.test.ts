import * as chai from 'chai';
import * as sinon from 'sinon';
import { OTelPerformanceManager } from './OTelPerformanceManager.js';
import type { PerformanceClock } from './types.js';

const { expect } = chai;

describe('OTelPerformanceManager', () => {
  let mockClock: PerformanceClock;
  let performanceManager: OTelPerformanceManager;

  beforeEach(() => {
    mockClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
    };
    performanceManager = new OTelPerformanceManager(mockClock);
  });

  it('should calculate epochMillisFromOriginOffset correctly', () => {
    const offset = 300;
    const result = performanceManager.epochMillisFromOriginOffset(offset);
    expect(result).to.equal(1300); // timeOrigin (1000) + offset (500)
  });

  it('should get current time in milliseconds', () => {
    const result = performanceManager.getNowMillis();
    expect(result).to.equal(1500); // timeOrigin (1000) + now() (500)
  });

  it('should get current time in HR time format', () => {
    const result = performanceManager.getNowHRTime();
    // HR time is [seconds, nanoseconds]
    expect(result[0]).to.equal(1); // 1 second
    expect(result[1]).to.equal(500000000); // 500ms = 500000000 nanoseconds
  });

  it('should handle zero offset', () => {
    const result = performanceManager.epochMillisFromOriginOffset(0);
    expect(result).to.equal(1000); // timeOrigin (1000) + offset (0)
  });
});
