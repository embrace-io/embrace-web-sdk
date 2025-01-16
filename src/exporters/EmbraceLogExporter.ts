import {
  DEFAULT_EMBRACE_EXPORTER_CONFIG,
  EMBRACE_LOG_ENDPOINT,
} from './constants';
import {getEmbraceHeaders} from './utils';
import OTLPFetchLogExporter from './OTLPFetchLogExporter';

class EmbraceLogExporter extends OTLPFetchLogExporter {
  constructor(appID: string) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      url: EMBRACE_LOG_ENDPOINT,
      headers: getEmbraceHeaders(appID),
    });
  }
}

export default EmbraceLogExporter;
