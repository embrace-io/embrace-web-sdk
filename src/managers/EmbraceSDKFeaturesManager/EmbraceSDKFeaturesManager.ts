import type { DynamicConfigManager } from '../../sdk/index.js';
import { isDeviceIdEnabled } from '../../utils/index.js';
import type { SDKFeaturesManager, SDKFeaturesManagerArgs } from './types.js';

export class EmbraceSDKFeaturesManager implements SDKFeaturesManager {
  private readonly _dynamicConfigManager: DynamicConfigManager;
  private readonly _deviceId: string;
  private readonly _blockNetworkSpanForwarding: boolean;

  public constructor({
    dynamicConfigManager,
    deviceId,
    blockNetworkSpanForwarding,
  }: SDKFeaturesManagerArgs) {
    this._dynamicConfigManager = dynamicConfigManager;
    this._deviceId = deviceId;
    this._blockNetworkSpanForwarding = blockNetworkSpanForwarding;
  }

  public isSDKEnabled(): boolean {
    const config = this._dynamicConfigManager.getConfig();

    return isDeviceIdEnabled(this._deviceId, config.samplingPct);
  }

  public isNetworkSpanForwardingEnabled(): boolean {
    if (this._blockNetworkSpanForwarding) {
      return false;
    }

    const config = this._dynamicConfigManager.getConfig();

    return isDeviceIdEnabled(
      this._deviceId,
      config.networkSpansForwardingThreshold,
    );
  }

  public isEmptySessionAvoidanceEnabled(): boolean {
    const config = this._dynamicConfigManager.getConfig();

    return isDeviceIdEnabled(
      this._deviceId,
      config.emptySessionAvoidanceEnabledPct,
    );
  }
}
