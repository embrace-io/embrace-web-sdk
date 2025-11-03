import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import type { URLDocument } from '../../common/index.js';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import type { EmbraceLogRecordProcessorArgs } from './types.js';

export class EmbraceLogRecordProcessor implements LogRecordProcessor {
  private readonly _urlDocument: URLDocument;

  public constructor({
    urlDocument = window.document,
  }: EmbraceLogRecordProcessorArgs = {}) {
    this._urlDocument = urlDocument;
  }

  // no-op
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord) {
    if (!logRecord.attributes[KEY_EMB_TYPE]) {
      logRecord.setAttribute(KEY_EMB_TYPE, EMB_TYPES.SystemLog);
    }

    logRecord.setAttribute(ATTR_URL_FULL, this._urlDocument.URL);
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
