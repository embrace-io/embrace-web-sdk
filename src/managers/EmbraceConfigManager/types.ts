import type { DiagLogger } from '@opentelemetry/api';

import type { DynamicSDKConfig } from '../../sdk/index.js';

export type RemoteConfigURLParams = {
  osVersion: string;
  appVersion: string;
  deviceId: string;
};

// All numbers from remote config are ranges from 0.0 to 100.0 that represent the % of devices which should be enabled
// for that particular feature / option
export type RemoteConfig = {
  threshold: number; // Main traffic control %, devices that fall outside of this should not emit any telemetry at all
  network_span_forwarding?: {
    pct_enabled: number;
  };
  empty_session_avoidance_enabled_pct?: number;
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
