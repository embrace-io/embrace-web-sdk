import { OTLPFetchTraceExporter } from '../OTLPFetchTraceExporter.js';
import { DEFAULT_EMBRACE_EXPORTER_CONFIG } from '../constants.js';
import { getEmbraceHeaders } from '../utils.js';
import { getTraceEndpoint } from './utils.js';
import { EmbraceTraceExporterArgs } from './types.js';

export class EmbraceTraceExporter extends OTLPFetchTraceExporter {
  constructor({ appID, userID }: EmbraceTraceExporterArgs) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      headers: getEmbraceHeaders(appID, userID),
      url: getTraceEndpoint(appID),
    });
  }
}
