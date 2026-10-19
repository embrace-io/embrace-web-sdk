import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { setupTestLogExporter } from '../../../tests/utils/index.ts';
import { KEY_EMB_PERF_CLOCK_LAG_MS } from '../../constants/index.ts';
import { OTelPerformanceManager } from '../../utils/index.ts';
import { PerfClockLagLogRecordProcessor } from './PerfClockLagLogRecordProcessor.ts';

const { expect } = chai;

const TIME_ORIGIN = 1756138004000;
const ONE_HOUR = 60 * 60 * 1000;

describe('PerfClockLagLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let logger: Logger;
  let clock: sinon.SinonFakeTimers;
  let perfNow: number;

  before(() => {
    const perf = new OTelPerformanceManager({
      now: () => perfNow,
      timeOrigin: TIME_ORIGIN,
    });
    memoryExporter = setupTestLogExporter([
      new PerfClockLagLogRecordProcessor({ perf }),
    ]);
    logger = logs.getLogger('test-logger');
  });

  beforeEach(() => {
    clock = sinon.useFakeTimers(TIME_ORIGIN);
    perfNow = 0;
  });

  afterEach(() => {
    memoryExporter.reset();
    clock.restore();
  });

  it('should record no lag when both clocks agree', () => {
    perfNow += 500;
    clock.tick(500);

    logger.emit({ body: 'some log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    expect(finishedLogs[0].attributes[KEY_EMB_PERF_CLOCK_LAG_MS]).to.equal(0);
  });

  it('should record the time slept since the page loaded', () => {
    // While the device sleeps Date.now() keeps moving but performance.now() does not.
    clock.setSystemTime(Date.now() + ONE_HOUR);

    logger.emit({ body: 'some log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    expect(finishedLogs[0].attributes[KEY_EMB_PERF_CLOCK_LAG_MS]).to.equal(
      ONE_HOUR,
    );
  });

  it('should make sure forceFlush no-op does not fail', () => {
    const processor = new PerfClockLagLogRecordProcessor({
      perf: new OTelPerformanceManager(),
    });

    expect(async () => {
      await processor.forceFlush();
    }).to.not.throw();
  });

  it('should make sure shutdown no-op does not fail', () => {
    const processor = new PerfClockLagLogRecordProcessor({
      perf: new OTelPerformanceManager(),
    });

    expect(async () => {
      await processor.shutdown();
    }).to.not.throw();
  });
});
