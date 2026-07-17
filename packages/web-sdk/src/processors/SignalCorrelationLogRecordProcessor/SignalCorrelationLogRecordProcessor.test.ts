import { millisToHrTime } from '@opentelemetry/core';
import type { SdkLogRecord } from '@opentelemetry/sdk-logs';
import { ATTR_LOG_RECORD_UID } from '@opentelemetry/semantic-conventions/incubating';
import * as chai from 'chai';
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
});
