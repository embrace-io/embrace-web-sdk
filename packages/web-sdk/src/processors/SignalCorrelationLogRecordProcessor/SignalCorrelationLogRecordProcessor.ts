import { diag } from '@opentelemetry/api';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import { ATTR_LOG_RECORD_UID } from '@opentelemetry/semantic-conventions/incubating';
import { KEY_EMB_TYPE } from '../../constants/index.ts';
import type { SignalBuffer } from '../utils/SignalBuffer.ts';
import type { SignalCorrelationLogRecordProcessorArgs } from './types.ts';

/**
 * Records each emitted log's synthetic id (log.record.uid) into the shared
 * signal buffer so soft-navigation spans can correlate logs from their window.
 * Must run after UserSessionLogRecordProcessor, which stamps the uid.
 */
export class SignalCorrelationLogRecordProcessor implements LogRecordProcessor {
  private readonly _buffer: SignalBuffer;

  public constructor({ buffer }: SignalCorrelationLogRecordProcessorArgs) {
    this._buffer = buffer;
  }

  public onEmit(logRecord: SdkLogRecord): void {
    try {
      const uid = logRecord.attributes[ATTR_LOG_RECORD_UID];
      // Stamped upstream by UserSessionLogRecordProcessor; if that ordering
      // regresses, this guard silently skips every log.
      if (typeof uid === 'string' && uid.length > 0) {
        this._buffer.record({
          kind: 'log',
          id: uid,
          startTime: hrTimeToMilliseconds(logRecord.hrTime),
          type: logRecord.attributes[KEY_EMB_TYPE] as string | undefined,
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
