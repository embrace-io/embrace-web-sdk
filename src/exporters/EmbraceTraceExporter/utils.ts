import { getDataURL } from '../utils.ts';

export const getTraceEndpoint = (appID: string, embraceDataURL?: string) =>
  `${getDataURL(appID, embraceDataURL)}/v2/spans`;
