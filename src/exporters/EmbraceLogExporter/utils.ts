import { getDataURL } from '../index.js';

export const getLogEndpoint = (appID: string, embraceDataURL?: string) =>
  `${getDataURL(appID, embraceDataURL)}/v2/logs`;
