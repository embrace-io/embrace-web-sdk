import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import {
  ATTR_LOG_RECORD_UID,
  ATTR_SESSION_ID,
} from '@opentelemetry/semantic-conventions/incubating';
import {
  KEY_EMB_SESSION_PART_ID,
  KEY_EMB_USER_SESSION_ID,
  KEY_EMB_USER_SESSION_PREVIOUS_ID,
} from '../../constants/index.ts';
import type { SpanSessionManagerInternal } from '../../managers/EmbraceSpanSessionManager/index.ts';
import {
  createUserSessionAttributes,
  generateUUID,
} from '../../utils/index.ts';
import type { IdentifiableSessionLogRecordProcessorArgs } from './types.ts';

export class IdentifiableSessionLogRecordProcessor
  implements LogRecordProcessor
{
  private readonly _spanSessionManager: SpanSessionManagerInternal;
  private readonly _diag: DiagLogger;

  public constructor({
    spanSessionManager,
  }: IdentifiableSessionLogRecordProcessorArgs) {
    this._spanSessionManager = spanSessionManager;
    this._diag = diag.createComponentLogger({
      namespace: 'IdentifiableSessionLogRecordProcessor',
    });
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord) {
    try {
      logRecord.setAttributes({
        [ATTR_LOG_RECORD_UID]: generateUUID(),
        ...createUserSessionAttributes(
          logRecord.attributes,
          this._spanSessionManager,
        ),
      });
    } catch (e) {
      // Fill the four session-attribution keys so a manager throw doesn't
      // leave the record with a partial shape.
      const fill: Record<string, string> = {};
      if (logRecord.attributes[KEY_EMB_SESSION_PART_ID] === undefined) {
        fill[KEY_EMB_SESSION_PART_ID] = '';
      }
      if (logRecord.attributes[KEY_EMB_USER_SESSION_ID] === undefined) {
        fill[KEY_EMB_USER_SESSION_ID] = '';
      }
      if (
        logRecord.attributes[KEY_EMB_USER_SESSION_PREVIOUS_ID] === undefined
      ) {
        fill[KEY_EMB_USER_SESSION_PREVIOUS_ID] = '';
      }
      if (logRecord.attributes[ATTR_SESSION_ID] === undefined) {
        fill[ATTR_SESSION_ID] = '';
      }
      logRecord.setAttributes(fill);
      this._diag.error('Error applying user session attributes to log', e);
    }
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
