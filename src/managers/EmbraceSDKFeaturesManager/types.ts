import type { DynamicConfigManager } from '../../sdk/index.js';

export interface SDKFeaturesManagerArgs {
  deviceId: string;
  dynamicConfigManager: DynamicConfigManager;
}

export interface SDKFeaturesManager {
  isSDKEnabled: () => boolean;
}
