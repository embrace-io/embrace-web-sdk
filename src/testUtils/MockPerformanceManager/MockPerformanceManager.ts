import { OTelPerformanceManager } from '../../utils/index.js';

export class MockPerformanceManager extends OTelPerformanceManager {
  public constructor(clock: sinon.SinonFakeTimers) {
    super({
      now: () => clock.now,
      timeOrigin: clock.now,
    });
  }
}
