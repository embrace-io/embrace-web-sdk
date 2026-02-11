import { DEFAULT_EMBRACE_EXPORTER_CONFIG } from '../constants.ts';
import { getEmbraceHeaders } from '../utils.ts';
import { OTLPFetchTraceExporter } from './OTLPFetchTraceExporter.ts';
import type { EmbraceTraceExporterArgs } from './types.ts';
import { getTraceEndpoint } from './utils.ts';

export class EmbraceTraceExporter extends OTLPFetchTraceExporter {
  public constructor({
    appID,
    userID,
    embraceDataURL,
  }: EmbraceTraceExporterArgs) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      headers: getEmbraceHeaders(appID, userID),
      url: getTraceEndpoint(appID, embraceDataURL),
    });
  }
}
