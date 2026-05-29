import type { DiagLogger } from '@opentelemetry/api';

import type { DynamicSDKConfig } from '../../sdk/index.ts';
import type { NamespacedStorage } from '../../utils/index.ts';

export type RemoteConfigURLParams = {
  osVersion: string;
  appVersion: string;
  deviceId: string;
};

// Percentage fields hold a 0.0-100.0 value: the % of devices a feature / option is enabled for.
export type RemoteConfig = {
  threshold: number; // Main traffic control %, devices that fall outside of this should not emit any telemetry at all
  network_span_forwarding?: {
    pct_enabled: number;
  };
  user_session?: {
    max_duration_seconds?: number;
    inactivity_timeout_seconds?: number;
    web_foreground_inactivity_timeout_seconds?: number;
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
  storage: NamespacedStorage;
  defaultConfig?: Partial<DynamicSDKConfig>;
  embraceConfigURL?: string;
}
