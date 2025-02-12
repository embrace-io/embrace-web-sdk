import { DEFAULT_EMBRACE_EXPORTER_CONFIG } from '../constants.js';
import { getEmbraceHeaders } from '../utils.js';
import { OTLPFetchLogExporter } from '../OTLPFetchLogExporter.js';
import { EmbraceLogExporterArgs } from './types.js';
import { getLogEndpoint } from './utils.js';

export class EmbraceLogExporter extends OTLPFetchLogExporter {
  constructor({ appID, userID }: EmbraceLogExporterArgs) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      headers: getEmbraceHeaders(appID, userID),
      url: getLogEndpoint(appID),
    });
  }
}
