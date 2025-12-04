import { DEFAULT_EMBRACE_EXPORTER_CONFIG } from '../constants.ts';
import { getEmbraceHeaders } from '../utils.ts';
import { OTLPFetchLogExporter } from './OTLPFetchLogExporter.ts';
import type { EmbraceLogExporterArgs } from './types.ts';
import { getLogEndpoint } from './utils.ts';

export class EmbraceLogExporter extends OTLPFetchLogExporter {
  public constructor({
    appID,
    userID,
    embraceDataURL,
  }: EmbraceLogExporterArgs) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      headers: getEmbraceHeaders(appID, userID),
      url: getLogEndpoint(appID, embraceDataURL),
    });
  }
}
