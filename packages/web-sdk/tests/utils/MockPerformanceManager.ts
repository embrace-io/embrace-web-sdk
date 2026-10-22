import { OTelPerformanceManager } from '../../src/utils/PerformanceManager/index.ts';

export class MockPerformanceManager extends OTelPerformanceManager {
  /**
   * Simulates the machine sleeping for `ms`: Date.now() moves forward while performance.now()
   * stays still, as on platforms where the perf clock stops during sleep. No timers fire.
   */
  public readonly sleep: (ms: number) => void;

  public constructor(clock: sinon.SinonFakeTimers) {
    // For real performance timing `timeOrigin` is the timestamp when the document's lifetime started: https://developer.mozilla.org/en-US/docs/Web/API/Performance/timeOrigin#value
    // When mocking set it to whatever value our fake clock had at the time that this MockPerformanceManager was instantiated
    const timeOrigin = clock.now;
    let sleptMillis = 0;

    super({
      // performance.now() counts from timeOrigin and does not advance while asleep
      now: () => clock.now - timeOrigin - sleptMillis,
      timeOrigin,
    });

    this.sleep = (ms: number) => {
      sleptMillis += ms;
      clock.setSystemTime(clock.now + ms);
    };
  }
}
