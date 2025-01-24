import {OTLPFetchTraceExporter} from '../OTLPFetchTraceExporter';
import {DEFAULT_EMBRACE_EXPORTER_CONFIG} from '../constants';
import {getEmbraceHeaders} from '../utils';
import {EMBRACE_TRACE_ENDPOINT} from './constants';

export class EmbraceTraceExporter extends OTLPFetchTraceExporter {
  constructor(appID: string) {
    super({
      ...DEFAULT_EMBRACE_EXPORTER_CONFIG,
      headers: getEmbraceHeaders(appID),
      url: EMBRACE_TRACE_ENDPOINT,
    });
  }
}
