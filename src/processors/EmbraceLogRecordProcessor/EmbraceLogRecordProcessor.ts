import type { LogRecord } from '@opentelemetry/sdk-logs';
import { type LogRecordProcessor } from '@opentelemetry/sdk-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import type { EmbraceLogRecordProcessorArgs } from './types.js';
import type { URLDocument } from '../../common/index.js';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';

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

  public onEmit(logRecord: LogRecord) {
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
