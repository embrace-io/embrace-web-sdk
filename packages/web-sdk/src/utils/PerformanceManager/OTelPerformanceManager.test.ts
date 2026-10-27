import * as chai from 'chai';
import * as sinon from 'sinon';
import { OTelPerformanceManager } from './OTelPerformanceManager.ts';
import type { PerformanceClock } from './types.ts';

const { expect } = chai;

const ONE_HOUR = 60 * 60 * 1000;

describe('OTelPerformanceManager', () => {
  let mockClock: PerformanceClock;
  let performanceManager: OTelPerformanceManager;

  beforeEach(() => {
    mockClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
    };
    // Wall clock agrees with timeOrigin + now(), i.e. the machine never slept.
    performanceManager = new OTelPerformanceManager(mockClock, () => 1500);
  });

  it('should calculate offsetToAbsoluteTime correctly', () => {
    const offset = 300;
    const result = performanceManager.offsetToAbsoluteTime(offset);
    expect(result).to.equal(1300); // timeOrigin (1000) + offset (300)
  });

  it('is unaffected by pageshow, since originOffset is already timeOrigin-relative', () => {
    performanceManager.setZeroTimeOffset(500); // pageshow bumps zero time, but not timeOrigin
    expect(performanceManager.offsetToAbsoluteTime(300)).to.equal(1300); // timeOrigin (1000) + offset (300)
  });

  it('should get current time in milliseconds', () => {
    const result = performanceManager.getNow();
    expect(result).to.equal(1500); // timeOrigin (1000) + now() (500)
  });

  it('is unaffected by pageshow, since it reports true wall-clock time', () => {
    performanceManager.setZeroTimeOffset(500); // pageshow bumps zero time, but not "now"
    // getNow() = timeOrigin (1000) + now() (500) = 1500
    expect(performanceManager.getNow()).to.equal(1500);
  });

  it('should handle zero offset', () => {
    const result = performanceManager.offsetToAbsoluteTime(0);
    expect(result).to.equal(1000); // timeOrigin (1000) + offset (0)
  });

  it('reads the perf clock for getOffsetFromOrigin, ignoring zero time', () => {
    performanceManager.setZeroTimeOffset(200);
    expect(performanceManager.getOffsetFromOrigin()).to.equal(500); // now() (500)
  });

  it('measures getOffsetFromZeroTime up to now when given no offset', () => {
    performanceManager.setZeroTimeOffset(200);
    expect(performanceManager.getOffsetFromZeroTime()).to.equal(300); // now() (500) - 200
  });

  it('should return originOffset unchanged from getOffsetFromZeroTime when zero time equals timeOrigin', () => {
    expect(performanceManager.getOffsetFromZeroTime(300)).to.equal(300);
    expect(performanceManager.getOffsetFromZeroTime(0)).to.equal(0);
  });

  it('rebases getOffsetFromZeroTime onto activationStart on prerendered pages', () => {
    const clockWithActivation: PerformanceClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
      getEntriesByType: sinon
        .stub()
        .returns([{ activationStart: 200 } as PerformanceNavigationTiming]),
    };
    const perf = new OTelPerformanceManager(clockWithActivation, () => 1500);
    expect(perf.getOffsetFromZeroTime(500)).to.equal(300); // 500 - 200
  });

  it('clamps getOffsetFromZeroTime to 0 for offsets before activationStart', () => {
    const clockWithActivation: PerformanceClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
      getEntriesByType: sinon
        .stub()
        .returns([{ activationStart: 200 } as PerformanceNavigationTiming]),
    };
    const perf = new OTelPerformanceManager(clockWithActivation, () => 1500);
    expect(perf.getOffsetFromZeroTime(100)).to.equal(0); // 100 - 200 clamped to 0
  });

  it('rebases getOffsetFromZeroTime onto the pageshow offset after a bfcache restore', () => {
    performanceManager.setZeroTimeOffset(800);
    expect(performanceManager.getOffsetFromZeroTime(1000)).to.equal(200); // 1000 - 800
  });

  it('clamps getOffsetFromZeroTime to 0 for offsets before the bfcache restore', () => {
    performanceManager.setZeroTimeOffset(800);
    expect(performanceManager.getOffsetFromZeroTime(500)).to.equal(0); // 500 - 800 clamped to 0
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
    const perf = new OTelPerformanceManager(clockWithEmptyNav, () => 1500);
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
    const perf = new OTelPerformanceManager(clockWithActivation, () => 1500);
    expect(perf.getZeroTime()).to.equal(1200); // timeOrigin (1000) + activationStart (200)
  });

  it('returns the pageshow time when the zero time offset is later than activationStart', () => {
    performanceManager.setZeroTimeOffset(500); // later than activationStart (0)
    expect(performanceManager.getZeroTime()).to.equal(1500); // timeOrigin (1000) + 500
  });

  it('returns timeOrigin + activationStart when the zero time offset is earlier', () => {
    const clockWithActivation: PerformanceClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
      getEntriesByType: sinon
        .stub()
        .returns([{ activationStart: 200 } as PerformanceNavigationTiming]),
    };
    const perf = new OTelPerformanceManager(clockWithActivation, () => 1500);
    perf.setZeroTimeOffset(100); // earlier than activationStart (200)
    expect(perf.getZeroTime()).to.equal(1200); // max wins
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

  it('shares zero time across instances on the same clock', () => {
    performanceManager.setZeroTimeOffset(1000);
    const secondPerf = new OTelPerformanceManager(mockClock, () => 1500);
    expect(secondPerf.getZeroTime()).to.equal(2000); // timeOrigin (1000) + 1000
  });

  it('does not share zero time across clocks', () => {
    performanceManager.setZeroTimeOffset(1000);
    const otherClock: PerformanceClock = {
      timeOrigin: 1000,
      now: sinon.stub().returns(500),
    };
    const otherPerf = new OTelPerformanceManager(otherClock, () => 1500);
    expect(otherPerf.getZeroTime()).to.equal(1000);
  });

  describe('when the perf clock stops during sleep', () => {
    const TIME_ORIGIN = 1_700_000_000_000;
    let perfNow: number;
    let wallNow: number;
    let clock: PerformanceClock;
    let perf: OTelPerformanceManager;

    // Both clocks move forward together while the machine is awake.
    const advanceAwake = (ms: number) => {
      perfNow += ms;
      wallNow += ms;
    };

    // While the machine sleeps Date.now() keeps moving but performance.now() does not.
    const sleep = (ms: number) => {
      wallNow += ms;
    };

    beforeEach(() => {
      perfNow = 0;
      wallNow = TIME_ORIGIN;
      clock = { timeOrigin: TIME_ORIGIN, now: () => perfNow };
      perf = new OTelPerformanceManager(clock, () => wallNow);
    });

    it('anchors getNow to the wall clock after a sleep', () => {
      advanceAwake(1000);
      sleep(ONE_HOUR);
      advanceAwake(500);

      expect(perf.getNow()).to.equal(TIME_ORIGIN + ONE_HOUR + 1500);
    });

    it('re-anchors when the wall clock moves backwards', () => {
      advanceAwake(1000);
      wallNow -= ONE_HOUR;

      expect(perf.getNow()).to.equal(TIME_ORIGIN - ONE_HOUR + 1000);
    });

    it('ignores drift up to the threshold', () => {
      advanceAwake(1000);
      sleep(1000);

      expect(perf.getNow()).to.equal(TIME_ORIGIN + 1000);
    });

    it('keeps getNow monotonic between corrections', () => {
      sleep(ONE_HOUR);
      const first = perf.getNow();
      advanceAwake(1);
      const second = perf.getNow();

      expect(second - first).to.equal(1);
    });

    it('converts entries from before the sleep with the original origin', () => {
      advanceAwake(1000);
      perf.checkDrift(); // e.g. the blur as the machine goes to sleep
      sleep(ONE_HOUR);
      advanceAwake(500);

      expect(perf.offsetToAbsoluteTime(800)).to.equal(TIME_ORIGIN + 800);
      // The last check before the sleep is known to predate it.
      expect(perf.offsetToAbsoluteTime(1000)).to.equal(TIME_ORIGIN + 1000);
    });

    it('converts entries from after the sleep with the corrected origin', () => {
      advanceAwake(1000);
      perf.checkDrift();
      sleep(ONE_HOUR);
      advanceAwake(500);

      // The first read after waking is this conversion, which notices the sleep.
      expect(perf.offsetToAbsoluteTime(1200)).to.equal(
        TIME_ORIGIN + ONE_HOUR + 1200,
      );
    });

    it('keeps the duration of an entry that spans a sleep when given its startTime', () => {
      advanceAwake(1000);
      perf.checkDrift();
      sleep(ONE_HOUR);
      advanceAwake(500);

      const start = perf.offsetToAbsoluteTime(800);
      const end = perf.offsetToAbsoluteTime(1300, 800);

      expect(end - start).to.equal(500);
    });

    it('keeps every segment while one tab sleeps many times', () => {
      for (let i = 0; i < 5; i++) {
        advanceAwake(1000);
        perf.checkDrift();
        sleep(ONE_HOUR);
      }
      advanceAwake(1000);

      // An entry taken between the 2nd and 3rd sleeps uses the origin after 2 sleeps.
      expect(perf.offsetToAbsoluteTime(2500)).to.equal(
        TIME_ORIGIN + 2 * ONE_HOUR + 2500,
      );
      expect(perf.getNow()).to.equal(TIME_ORIGIN + 5 * ONE_HOUR + 6000);
    });

    it('caps the origin history but always keeps the first segment', () => {
      advanceAwake(1000);
      for (let i = 0; i < 150; i++) {
        perf.checkDrift();
        sleep(ONE_HOUR);
        advanceAwake(10);
      }

      expect(perf.offsetToAbsoluteTime(500)).to.equal(TIME_ORIGIN + 500);
      expect(perf.getNow()).to.equal(TIME_ORIGIN + 150 * ONE_HOUR + perfNow);
    });

    it('shares the origin history across instances on the same clock', () => {
      advanceAwake(1000);
      perf.checkDrift();
      sleep(ONE_HOUR);
      advanceAwake(500);
      perf.checkDrift();

      const otherPerf = new OTelPerformanceManager(clock, () => wallNow);
      expect(otherPerf.offsetToAbsoluteTime(800)).to.equal(TIME_ORIGIN + 800);
      expect(otherPerf.offsetToAbsoluteTime(1200)).to.equal(
        TIME_ORIGIN + ONE_HOUR + 1200,
      );
    });

    it('reports the uncorrected lag from getClockLag', () => {
      advanceAwake(1000);
      sleep(ONE_HOUR);
      perf.getNow(); // the correction does not hide the lag

      expect(perf.getClockLag()).to.equal(ONE_HOUR);
    });

    it('reports the lag and still re-anchors when timeOrigin moves forward after a sleep, as in Safari', () => {
      let slept = 0;
      const movingOriginClock: PerformanceClock = {
        get timeOrigin() {
          return TIME_ORIGIN + slept;
        },
        now: () => perfNow,
      };
      const safariPerf = new OTelPerformanceManager(
        movingOriginClock,
        () => wallNow,
      );

      advanceAwake(1000);
      safariPerf.checkDrift(); // e.g. the blur as the machine goes to sleep
      sleep(ONE_HOUR);
      slept += ONE_HOUR;

      expect(safariPerf.getClockLag()).to.equal(ONE_HOUR);
      expect(safariPerf.getNow()).to.equal(TIME_ORIGIN + ONE_HOUR + 1000);
      expect(safariPerf.offsetToAbsoluteTime(500)).to.equal(TIME_ORIGIN + 500);
    });

    it('rounds getClockLag to whole milliseconds', () => {
      wallNow = TIME_ORIGIN + 1234.6;

      expect(perf.getClockLag()).to.equal(1235);
    });

    it('counts only the time slept since the given origin in getClockLag', () => {
      advanceAwake(1000);
      sleep(ONE_HOUR);
      const spanWallOrigin = wallNow - perfNow; // as a span started now reads it
      advanceAwake(500);
      sleep(ONE_HOUR / 2);

      expect(perf.getClockLag()).to.equal(ONE_HOUR + ONE_HOUR / 2);
      expect(perf.getClockLag(spanWallOrigin)).to.equal(ONE_HOUR / 2);
    });

    it('includes time asleep in a getNow difference', () => {
      advanceAwake(1000);
      const start = perf.getNow();
      sleep(ONE_HOUR);
      advanceAwake(500);

      expect(perf.getNow() - start).to.equal(ONE_HOUR + 500);
    });

    it('leaves time asleep out of getOffsetFromZeroTime up to now', () => {
      advanceAwake(1000);
      perf.setZeroTimeOffset(1000);
      sleep(ONE_HOUR);
      advanceAwake(500);

      expect(perf.getOffsetFromZeroTime()).to.equal(500);
    });

    it('measures from a zero time set before a sleep by perf difference', () => {
      advanceAwake(1000);
      perf.setZeroTimeOffset(1000); // e.g. a soft navigation
      perf.checkDrift();
      sleep(ONE_HOUR);
      advanceAwake(500);

      // An entry rendered after waking: time asleep is not part of the view time.
      expect(perf.getOffsetFromZeroTime(1300)).to.equal(300);
      // Zero time itself happened before the sleep, under the original origin.
      expect(perf.getZeroTime()).to.equal(TIME_ORIGIN + 1000);
    });

    it('anchors getZeroTime to an entry so a span from zero time keeps its duration', () => {
      advanceAwake(1000);
      perf.setZeroTimeOffset(1000);
      perf.checkDrift();
      sleep(ONE_HOUR);
      advanceAwake(500);

      const start = perf.getZeroTime(1300);
      const end = perf.offsetToAbsoluteTime(1300);

      expect(end - start).to.equal(perf.getOffsetFromZeroTime(1300));
    });
  });
});
