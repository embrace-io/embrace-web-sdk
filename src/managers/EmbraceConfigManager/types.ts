import type { DiagLogger } from '@opentelemetry/api';

import type { DynamicSDKConfig } from '../../sdk/index.js';

export type RemoteConfigURLParams = {
  osVersion: string;
  appVersion: string;
  deviceId: string;
};

// Threshold numbers are from 1 to 100
export type RemoteConfig = {
  threshold: number;
  network_span_forwarding?: {
    pct_enabled: number;
  };
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
