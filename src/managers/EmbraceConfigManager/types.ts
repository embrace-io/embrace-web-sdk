import type { DiagLogger } from '@opentelemetry/api';

import type { DynamicSDKConfig } from '../../sdk/index.js';

export type RemoteConfigURLParams = {
  osVersion: string;
  appVersion: string;
  deviceId: string;
};

export type RemoteConfig = {
  threshold: number; // Number from 1 to 100
};

export type StoredRemoteConfig = {
  config: RemoteConfig;
  etag: string | null;
};

export interface EmbraceDynamicConfigManagerArgs {
  appID?: string;
  appVersion?: string;
  deviceId?: string;
  diag?: DiagLogger;
  storage?: Storage;
  defaultConfig?: Partial<DynamicSDKConfig>;
  embraceConfigURL?: string;
}
