import { DEFAULT_EMBRACE_EXPORTER_CONFIG } from '../constants.js';
import { getEmbraceHeaders } from '../utils.js';
import { OTLPFetchLogExporter } from './OTLPFetchLogExporter.js';
import type { EmbraceLogExporterArgs } from './types.js';
import { getLogEndpoint } from './utils.js';

export class EmbraceLogExporter extends OTLPFetchLogExporter {
  public constructor({ appID, userID }: EmbraceLogExporterArgs) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      headers: getEmbraceHeaders(appID, userID),
      url: getLogEndpoint(appID),
    });
  }
}
