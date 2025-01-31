import {
  DEFAULT_EMBRACE_EXPORTER_CONFIG,
  EMBRACE_LOG_ENDPOINT,
} from './constants';
import {getEmbraceHeaders} from './utils';
import OTLPFetchLogExporter from './OTLPFetchLogExporter';

interface EmbraceLogExporterArgs {
  appID: string;
}

class EmbraceLogExporter extends OTLPFetchLogExporter {
  constructor({appID}: EmbraceLogExporterArgs) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      url: EMBRACE_LOG_ENDPOINT,
      headers: getEmbraceHeaders(appID),
    });
  }
}

export default EmbraceLogExporter;
