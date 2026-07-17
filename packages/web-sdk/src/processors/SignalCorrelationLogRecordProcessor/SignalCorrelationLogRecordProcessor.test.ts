import { DiagLogLevel, diag } from '@opentelemetry/api';
import { millisToHrTime } from '@opentelemetry/core';
import type { SdkLogRecord } from '@opentelemetry/sdk-logs';
import { ATTR_LOG_RECORD_UID } from '@opentelemetry/semantic-conventions/incubating';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { InMemoryDiagLogger } from '../../../tests/utils/index.ts';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import { SignalBuffer } from '../utils/SignalBuffer.ts';
import { SignalCorrelationLogRecordProcessor } from './SignalCorrelationLogRecordProcessor.ts';

const { expect } = chai;

const fakeLogRecord = (
  attributes: Record<string, unknown>,
  epochMillis: number,
): SdkLogRecord =>
  ({
    attributes,
    hrTime: millisToHrTime(epochMillis),
  }) as unknown as SdkLogRecord;

describe('SignalCorrelationLogRecordProcessor', () => {
  let diagLogger: InMemoryDiagLogger;

  beforeEach(() => {
    diagLogger = new InMemoryDiagLogger();
    diag.setLogger(diagLogger, DiagLogLevel.ALL);
  });

  afterEach(() => {
    diag.disable();
  });

  it('records the log.record.uid with its timestamp', () => {
    const buffer = new SignalBuffer();
    const processor = new SignalCorrelationLogRecordProcessor({
      buffer,
    });

    processor.onEmit(fakeLogRecord({ [ATTR_LOG_RECORD_UID]: 'uid-1' }, 1500));

    expect(buffer.collectWindow(1500, 1500).logIds).to.deep.equal(['uid-1']);
  });

  it('ignores a log record without a uid', () => {
    const buffer = new SignalBuffer();
    const processor = new SignalCorrelationLogRecordProcessor({
      buffer,
    });

    processor.onEmit(fakeLogRecord({}, 1500));

    expect(buffer.collectWindow(0, 10000).logIds).to.deep.equal([]);
  });

  it('records the emb.type already present on the log record', () => {
    const buffer = new SignalBuffer();
    const processor = new SignalCorrelationLogRecordProcessor({
      buffer,
    });

    processor.onEmit(
      fakeLogRecord(
        { [ATTR_LOG_RECORD_UID]: 'uid-1', [KEY_EMB_TYPE]: EMB_TYPES.SystemLog },
        1500,
      ),
    );

    expect(buffer.collectWindow(1500, 1500).logTypes).to.deep.equal([
      EMB_TYPES.SystemLog,
    ]);
  });

  it('records an empty type when the log record has no emb.type yet', () => {
    const buffer = new SignalBuffer();
    const processor = new SignalCorrelationLogRecordProcessor({
      buffer,
    });

    processor.onEmit(fakeLogRecord({ [ATTR_LOG_RECORD_UID]: 'uid-1' }, 1500));

    expect(buffer.collectWindow(1500, 1500).logTypes).to.deep.equal(['']);
  });

  it('logs an error when recording the log record throws', () => {
    const buffer = new SignalBuffer();
    sinon.stub(buffer, 'record').throws(new Error('boom'));
    const processor = new SignalCorrelationLogRecordProcessor({
      buffer,
    });

    processor.onEmit(fakeLogRecord({ [ATTR_LOG_RECORD_UID]: 'uid-1' }, 1500));

    expect(diagLogger.getErrorLogs()).to.include(
      'failed to record log for soft-navigation correlation',
    );
  });

  it('should make sure forceFlush no-op does not fail', () => {
    const processor = new SignalCorrelationLogRecordProcessor({
      buffer: new SignalBuffer(),
    });

    expect(async () => {
      await processor.forceFlush();
    }).to.not.throw();
  });

  it('should make sure shutdown no-op does not fail', () => {
    const processor = new SignalCorrelationLogRecordProcessor({
      buffer: new SignalBuffer(),
    });

    expect(async () => {
      await processor.shutdown();
    }).to.not.throw();
  });
});
