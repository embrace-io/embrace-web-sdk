import { millisToHrTime } from '@opentelemetry/core';
import type { SdkLogRecord } from '@opentelemetry/sdk-logs';
import { ATTR_LOG_RECORD_UID } from '@opentelemetry/semantic-conventions/incubating';
import * as chai from 'chai';
import { SoftNavigationSignalBuffer } from '../SoftNavigationCorrelationSpanProcessor/SoftNavigationSignalBuffer.ts';
import { SoftNavigationCorrelationLogRecordProcessor } from './SoftNavigationCorrelationLogRecordProcessor.ts';

const { expect } = chai;

const fakeLogRecord = (
  attributes: Record<string, unknown>,
  epochMillis: number,
): SdkLogRecord =>
  ({
    attributes,
    hrTime: millisToHrTime(epochMillis),
  }) as unknown as SdkLogRecord;

describe('SoftNavigationCorrelationLogRecordProcessor', () => {
  it('records the log.record.uid with its timestamp', () => {
    const buffer = new SoftNavigationSignalBuffer();
    const processor = new SoftNavigationCorrelationLogRecordProcessor({
      buffer,
    });

    processor.onEmit(fakeLogRecord({ [ATTR_LOG_RECORD_UID]: 'uid-1' }, 1500));

    expect(buffer.collectWindow(1500, 1500).logIds).to.deep.equal(['uid-1']);
  });

  it('ignores a log record without a uid', () => {
    const buffer = new SoftNavigationSignalBuffer();
    const processor = new SoftNavigationCorrelationLogRecordProcessor({
      buffer,
    });

    processor.onEmit(fakeLogRecord({}, 1500));

    expect(buffer.collectWindow(0, 10000).logIds).to.deep.equal([]);
  });
});
