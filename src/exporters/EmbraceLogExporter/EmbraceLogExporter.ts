import { DEFAULT_EMBRACE_EXPORTER_CONFIG } from '../constants.js';
import { getEmbraceHeaders } from '../utils.js';
import { OTLPFetchLogExporter } from '../OTLPFetchLogExporter.js';
import { EmbraceLogExporterArgs } from './types.js';
import { EMBRACE_LOG_ENDPOINT } from './constants.js';

export class EmbraceLogExporter extends OTLPFetchLogExporter {
  constructor({ appID }: EmbraceLogExporterArgs) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      url: EMBRACE_LOG_ENDPOINT,
      headers: getEmbraceHeaders(appID),
    });
  }
}
