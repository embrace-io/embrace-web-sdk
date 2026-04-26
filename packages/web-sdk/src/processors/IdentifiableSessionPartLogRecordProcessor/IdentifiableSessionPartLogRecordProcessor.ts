import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type { SessionPartManager } from '../../api-sessions/index.ts';
import { KEY_EMB_SESSION_PART_ID } from '../../constants/index.ts';
import { generateUUID } from '../../utils/index.ts';
import type { IdentifiableSessionPartLogRecordProcessorArgs } from './types.ts';

const ATTR_LOG_RECORD_UID = 'log.record.uid';

export class IdentifiableSessionPartLogRecordProcessor
  implements LogRecordProcessor
{
  private readonly _sessionPartManager: SessionPartManager;
  private readonly _diag: DiagLogger;

  public constructor({
    sessionPartManager,
  }: IdentifiableSessionPartLogRecordProcessorArgs) {
    this._sessionPartManager = sessionPartManager;
    this._diag = diag.createComponentLogger({
      namespace: 'IdentifiableSessionPartLogRecordProcessor',
    });
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord) {
    try {
      logRecord.setAttributes({
        [ATTR_LOG_RECORD_UID]: generateUUID(),
      });
      const partId = this._sessionPartManager.getSessionPartId();
      if (partId) {
        logRecord.setAttributes({
          [KEY_EMB_SESSION_PART_ID]: partId,
        });
      }
    } catch (e) {
      this._diag.warn('Error stamping session part id on log record', e);
    }
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
