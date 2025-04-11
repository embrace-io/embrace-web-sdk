import { getDataURL } from '../index.js';

export const getTraceEndpoint = (appID: string) =>
  getDataURL(appID) + '/v2/spans';
