import { getDataURL } from '../utils.js';

export const getLogEndpoint = (appID: string, embraceDataURL?: string) =>
  `${getDataURL(appID, embraceDataURL)}/v2/logs`;
