import { OTelPerformanceManager } from '../../utils/index.js';

export class MockPerformanceManager extends OTelPerformanceManager {
  public constructor(clock: sinon.SinonFakeTimers) {
    super({
      now: () => clock.now,
      // For real performance timing `timeOrigin` is the timestamp when the document's lifetime started: https://developer.mozilla.org/en-US/docs/Web/API/Performance/timeOrigin#value
      // When mocking set it to whatever value our fake clock had at the time that this MockPerformanceManager was instantiated
      timeOrigin: clock.now,
    });
  }
}
