import { OTLPFetchTraceExporter } from '../OTLPFetchTraceExporter.js';
import { DEFAULT_EMBRACE_EXPORTER_CONFIG } from '../constants.js';
import { getEmbraceHeaders } from '../utils.js';
import { getTraceEndpoint } from './utils.js';

export class EmbraceTraceExporter extends OTLPFetchTraceExporter {
  constructor(appID: string) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      headers: getEmbraceHeaders(appID),
      url: getTraceEndpoint(appID),
    });
  }
}
