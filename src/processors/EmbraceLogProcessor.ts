import {SimpleLogRecordProcessor, LogRecord} from '@opentelemetry/sdk-logs';
import generateUUID from '../utils/generateUUID';
import {EMB_LOG_ID} from '../constants/attributes';

class EmbraceLogProcessor extends SimpleLogRecordProcessor {
  onEmit(logRecord: LogRecord) {
    logRecord.setAttribute(EMB_LOG_ID, generateUUID());

    super.onEmit(logRecord);
  }
}

export default EmbraceLogProcessor;
