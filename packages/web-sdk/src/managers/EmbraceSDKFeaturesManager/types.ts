import type { DynamicConfigManager } from '../../sdk/types.ts';

export interface SDKFeaturesManagerArgs {
  deviceId: string;
  dynamicConfigManager: DynamicConfigManager;
  blockNetworkSpanForwarding: boolean;
}

export interface SDKFeaturesManager {
  isSDKEnabled: () => boolean;
  isNetworkSpanForwardingEnabled: () => boolean;
}
