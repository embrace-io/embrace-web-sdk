import { getDataURL } from '../index.js';

export const getLogEndpoint = (appID: string) => getDataURL(appID) + '/v2/logs';
