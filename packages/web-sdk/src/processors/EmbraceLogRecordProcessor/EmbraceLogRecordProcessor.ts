import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import type {
  URLDocument,
  VisibilityStateDocument,
} from '../../common/index.ts';
import { KEY_EMB_TAB_IS_TAB_ENGAGED } from '../../constants/attributes.ts';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import { isTabEngaged } from '../../utils/index.ts';
import type { EmbraceLogRecordProcessorArgs } from './types.ts';

export class EmbraceLogRecordProcessor implements LogRecordProcessor {
  private readonly _urlDocument: URLDocument;
  private readonly _visibilityDocument: VisibilityStateDocument;

  public constructor({
    urlDocument = window.document,
    visibilityDocument = window.document,
  }: EmbraceLogRecordProcessorArgs = {}) {
    this._urlDocument = urlDocument;
    this._visibilityDocument = visibilityDocument;
  }

  // no-op
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord) {
    if (!logRecord.attributes[KEY_EMB_TYPE]) {
      logRecord.setAttribute(KEY_EMB_TYPE, EMB_TYPES.SystemLog);
    }

    if (!logRecord.attributes[ATTR_URL_FULL]) {
      logRecord.setAttribute(ATTR_URL_FULL, this._urlDocument.URL);
    }

    if (!logRecord.attributes[KEY_EMB_TAB_IS_TAB_ENGAGED]) {
      logRecord.setAttribute(
        KEY_EMB_TAB_IS_TAB_ENGAGED,
        isTabEngaged(this._visibilityDocument),
      );
    }
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
