import { getDataURL } from '../utils.ts';

export const getLogEndpoint = (appID: string, embraceDataURL?: string) =>
  `${getDataURL(appID, embraceDataURL)}/v2/logs`;
