import { millisToHrTime } from '@opentelemetry/core';
import type { PerformanceManager } from '../../utils/index.js';
// Note: this is required as the latest version of sinon (19.0.2)  is not yet referencing the latest version of fake-timers (14)
// which has the timeOrigin property on SinonFakeTimers. Will fake it for now and remove once sinon release its next version
type PatchedSinonFakeTimers = sinon.SinonFakeTimers & {
  performance: { timeOrigin: number };
};

// taken from https://github.com/sinonjs/fake-timers/pull/515/files#diff-41a23d75048c36f3649e9fea5cd63cab3d94802c03bc6df0fdc009847d786bf1R1838
const patch = (clock: sinon.SinonFakeTimers): PatchedSinonFakeTimers => {
  const patchedClock = clock as PatchedSinonFakeTimers;
  patchedClock.performance.timeOrigin = 0;
  return patchedClock;
};

export class MockPerformanceManager implements PerformanceManager {
  private readonly _clock: PatchedSinonFakeTimers;

  public constructor(clock: sinon.SinonFakeTimers) {
    this._clock = patch(clock);
  }

  public epochMillisFromOriginOffset = (originOffset: number) =>
    this._clock.performance.timeOrigin + originOffset;

  public getNowHRTime = () => millisToHrTime(this.getNowMillis());

  public getNowMillis = () =>
    this.epochMillisFromOriginOffset(this._clock.performance.now());
}
