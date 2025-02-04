import { getDataURL } from '../utils.js';

export const getLogEndpoint = (appID: string) => getDataURL(appID) + '/v2/logs';
