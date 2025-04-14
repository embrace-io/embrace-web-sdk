import type { SDKControl, SDKRegistryManager } from './types.js';

class Registry implements SDKRegistryManager {
  private _sdk: SDKControl | null = null;

  public register: (sdk: SDKControl) => void = sdk => {
    this._sdk = sdk;
  };

  public clear: () => void = () => {
    this._sdk = null;
  };

  public registered: () => SDKControl | null = () => {
    return this._sdk;
  };
}

export const registry = new Registry();
