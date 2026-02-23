import type { DynamicConfigManager } from '../../sdk/index.ts';

export interface SDKFeaturesManagerArgs {
  deviceId: string;
  dynamicConfigManager: DynamicConfigManager;
  blockNetworkSpanForwarding: boolean;
}

export interface SDKFeaturesManager {
  isSDKEnabled: () => boolean;
  isNetworkSpanForwardingEnabled: () => boolean;
  isEmptySessionAvoidanceEnabled: () => boolean;
}
