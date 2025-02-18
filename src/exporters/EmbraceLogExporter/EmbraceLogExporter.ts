import { DEFAULT_EMBRACE_EXPORTER_CONFIG } from '../constants.js';
import { getEmbraceHeaders } from '../utils.js';
import { OTLPFetchLogExporter } from '../OTLPFetchLogExporter.js';
import { EmbraceLogExporterArgs } from './types.js';
import { getLogEndpoint } from './utils.js';
import { ExportResult } from '@opentelemetry/core';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';

export class EmbraceLogExporter extends OTLPFetchLogExporter {
  constructor({ appID, userID }: EmbraceLogExporterArgs) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      headers: getEmbraceHeaders(appID, userID),
      url: getLogEndpoint(appID),
    });
  }

  override export(
    items: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void
  ): void {
    items.forEach(item => {
      // SystemLog = 'sys.log', is an log emb type that tells the Embrace BE to process and keep the log.
      // Our SDK adds it to any log generated through Embrace SDK. We check if this isn't already configure for some
      // other specific emb.type and if not we set it to SystemLog.
      item.attributes[KEY_EMB_TYPE] ??= EMB_TYPES.SystemLog;
    });
    super.export(items, resultCallback);
  }
}
