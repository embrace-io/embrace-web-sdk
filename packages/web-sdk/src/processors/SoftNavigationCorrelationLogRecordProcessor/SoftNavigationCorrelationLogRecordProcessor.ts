import { diag } from '@opentelemetry/api';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import { ATTR_LOG_RECORD_UID } from '@opentelemetry/semantic-conventions/incubating';
import type { SoftNavigationSignalBuffer } from '../SoftNavigationCorrelationSpanProcessor/SoftNavigationSignalBuffer.ts';
import type { SoftNavigationCorrelationLogRecordProcessorArgs } from './types.ts';

/**
 * Records each emitted log's synthetic id (log.record.uid) into the shared
 * signal buffer so soft-navigation spans can correlate logs from their window.
 * Must run after UserSessionLogRecordProcessor, which stamps the uid.
 */
export class SoftNavigationCorrelationLogRecordProcessor
  implements LogRecordProcessor
{
  private readonly _buffer: SoftNavigationSignalBuffer;

  public constructor({
    buffer,
  }: SoftNavigationCorrelationLogRecordProcessorArgs) {
    this._buffer = buffer;
  }

  public onEmit(logRecord: SdkLogRecord): void {
    try {
      const uid = logRecord.attributes[ATTR_LOG_RECORD_UID];
      if (typeof uid === 'string' && uid.length > 0) {
        this._buffer.record({
          kind: 'log',
          id: uid,
          startEpochMillis: hrTimeToMilliseconds(logRecord.hrTime),
        });
      }
    } catch (e) {
      diag.error('failed to record log for soft-navigation correlation', e);
    }
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
