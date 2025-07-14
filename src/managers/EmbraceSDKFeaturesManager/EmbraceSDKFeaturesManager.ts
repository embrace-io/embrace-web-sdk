import type { SDKFeaturesManager, SDKFeaturesManagerArgs } from './types.js';
import type { DynamicConfigManager } from '../../sdk/index.js';
import { isDeviceIdSampled } from '../../utils/index.js';

export class EmbraceSDKFeaturesManager implements SDKFeaturesManager {
  private readonly _dynamicConfigManager: DynamicConfigManager;
  private readonly _deviceId: string;

  public constructor({
    dynamicConfigManager,
    deviceId,
  }: SDKFeaturesManagerArgs) {
    this._dynamicConfigManager = dynamicConfigManager;
    this._deviceId = deviceId;
  }

  public isSDKEnabled(): boolean {
    const config = this._dynamicConfigManager.getConfig();

    return isDeviceIdSampled(this._deviceId, config.samplingPct);
  }
}
