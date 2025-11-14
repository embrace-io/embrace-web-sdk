import { getDataURL } from '../utils.js';

export const getTraceEndpoint = (appID: string, embraceDataURL?: string) =>
  `${getDataURL(appID, embraceDataURL)}/v2/spans`;
