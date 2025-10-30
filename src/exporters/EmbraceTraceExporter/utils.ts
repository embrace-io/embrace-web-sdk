import { getDataURL } from '../index.js';

export const getTraceEndpoint = (appID: string, embraceDataURL?: string) =>
  `${getDataURL(appID, embraceDataURL)}/v2/spans`;
