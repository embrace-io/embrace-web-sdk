import { getDataURL } from '../utils.js';

export const getTraceEndpoint = (appID: string) =>
  getDataURL(appID) + '/v2/spans';
