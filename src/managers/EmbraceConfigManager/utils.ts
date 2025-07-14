import type { RemoteConfigURLParams } from './types.js';

export const getConfigURL = (
  appId: string,
  { osVersion, appVersion, deviceId }: RemoteConfigURLParams,
  embraceConfigURL?: string
): string =>
  `${embraceConfigURL || `https://a-${appId}.config.emb-api.com`}/v2/config?appId=${appId}&osVersion=${osVersion}&appVersion=${appVersion}&deviceId=${deviceId}`;