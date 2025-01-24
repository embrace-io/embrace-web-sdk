import {DEFAULT_EMBRACE_EXPORTER_CONFIG} from '../constants';
import {getEmbraceHeaders} from '../utils';
import {OTLPFetchLogExporter} from '../OTLPFetchLogExporter';
import {EmbraceLogExporterArgs} from './types';
import {EMBRACE_LOG_ENDPOINT} from './constants';

export class EmbraceLogExporter extends OTLPFetchLogExporter {
  constructor({appID}: EmbraceLogExporterArgs) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      url: EMBRACE_LOG_ENDPOINT,
      headers: getEmbraceHeaders(appID),
    });
  }
}
