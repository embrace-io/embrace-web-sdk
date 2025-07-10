import type { RemoteConfig, RemoteConfigURLParams } from './types.js';
import type { SDKConfig } from '../../common/index.js';

export const getConfigURL = (
  appId: string,
  { osVersion, appVersion, deviceId }: RemoteConfigURLParams
): string =>
  `https://a-${appId}.config.emb-api.com/v2/config?appId=${appId}&osVersion=${osVersion}&appVersion=${appVersion}&deviceId=${deviceId}`;

export const parseRemoteConfig = (remoteConfig: RemoteConfig): SDKConfig => ({
  threshold: remoteConfig.threshold / 100, // Convert percentage to decimal
});
