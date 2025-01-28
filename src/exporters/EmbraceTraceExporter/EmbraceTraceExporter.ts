import { OTLPFetchTraceExporter } from '../OTLPFetchTraceExporter.js';
import { DEFAULT_EMBRACE_EXPORTER_CONFIG } from '../constants.js';
import { getEmbraceHeaders } from '../utils.js';
import { EMBRACE_TRACE_ENDPOINT } from './constants.js';

export class EmbraceTraceExporter extends OTLPFetchTraceExporter {
  constructor(appID: string) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      headers: getEmbraceHeaders(appID),
      url: EMBRACE_TRACE_ENDPOINT,
    });
  }
}
