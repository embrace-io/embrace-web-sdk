import { SeverityNumber } from '@opentelemetry/api-logs';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import {
  InMemoryLogRecordExporter,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { MockPerformanceManager } from '../../../tests/utils/index.ts';
import { EmbraceLoggerProvider } from './EmbraceLoggerProvider.ts';

const { expect } = chai;

const TIME_ORIGIN = 1_700_000_000_000;
const ONE_HOUR = 60 * 60 * 1000;

describe('EmbraceLoggerProvider', () => {
  let clock: sinon.SinonFakeTimers;
  let perf: MockPerformanceManager;
  let memoryExporter: InMemoryLogRecordExporter;
  let provider: EmbraceLoggerProvider;

  const getEmittedMillis = () =>
    memoryExporter
      .getFinishedLogRecords()
      .map((record) => hrTimeToMilliseconds(record.hrTime));

  beforeEach(() => {
    // Also sets performance.timeOrigin, which OTel and the provider read
    clock = sinon.useFakeTimers({ now: TIME_ORIGIN });
    perf = new MockPerformanceManager(clock);
    memoryExporter = new InMemoryLogRecordExporter();
    provider = new EmbraceLoggerProvider({
      processors: [new SimpleLogRecordProcessor({ exporter: memoryExporter })],
      perf,
    });
  });

  afterEach(() => {
    clock.restore();
  });

  it('stamps a log without a timestamp with the SDK clock', () => {
    clock.tick(1000);
    // Under the 1s drift threshold, so the SDK clock keeps its origin and
    // trails Date.now() by 500ms
    perf.sleep(500);

    provider.getLogger('test').emit({ body: 'no timestamp' });

    expect(getEmittedMillis()).to.deep.equal([TIME_ORIGIN + 1000]);
  });

  it('converts a performance.now()-based timestamp on the SDK clock', () => {
    clock.tick(1000);
    perf.sleep(ONE_HOUR);
    clock.tick(500);

    // OTel alone would read it as timeOrigin + 1500, an hour in the past
    provider.getLogger('test').emit({ body: 'offset', timestamp: 1500 });

    expect(getEmittedMillis()).to.deep.equal([TIME_ORIGIN + ONE_HOUR + 1500]);
  });

  it('keeps epoch, Date and HrTime timestamps', () => {
    perf.sleep(ONE_HOUR);
    const logger = provider.getLogger('test');

    logger.emit({ timestamp: 2_000_000_000_000 });
    logger.emit({ timestamp: new Date(2_000_000_000_001) });
    logger.emit({ timestamp: [2_000_000_000, 2_000_000] });

    expect(getEmittedMillis()).to.deep.equal([
      2_000_000_000_000, 2_000_000_000_001, 2_000_000_000_002,
    ]);
  });

  it('keeps the rest of the record and the logger scope', () => {
    provider.getLogger('test-scope', '1.2.3').emit({
      eventName: 'test-event',
      severityNumber: SeverityNumber.WARN,
      severityText: 'WARNING',
      body: 'test body',
      attributes: { key: 'value' },
    });

    const [record] = memoryExporter.getFinishedLogRecords();
    expect(record.eventName).to.equal('test-event');
    expect(record.severityNumber).to.equal(SeverityNumber.WARN);
    expect(record.severityText).to.equal('WARNING');
    expect(record.body).to.equal('test body');
    expect(record.attributes).to.deep.equal({ key: 'value' });
    expect(record.instrumentationScope.name).to.equal('test-scope');
    expect(record.instrumentationScope.version).to.equal('1.2.3');
  });
});
