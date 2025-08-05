import type { RemoteConfigURLParams } from './types.js';

export const getConfigURL = (
  appID: string,
  { osVersion, appVersion, deviceId }: RemoteConfigURLParams,
  embraceConfigURL?: string
): string =>
  `${embraceConfigURL || `https://a-${appID}.config.emb-api.com`}/v2/config?appId=${appID}&osVersion=${osVersion}&appVersion=${appVersion}&deviceId=${deviceId}`;
