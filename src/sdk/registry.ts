import type { SDKControl, SDKRegistryManager } from './types.js';
import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';

class Registry implements SDKRegistryManager {
  private _sdk: SDKControl | null = null;
  private readonly _diag: DiagLogger;

  public constructor({
    diagLogger = diag.createComponentLogger({ namespace: 'embrace-registry' }),
  }: { diagLogger?: DiagLogger } = {}) {
    this._diag = diagLogger;
  }

  public register: (sdk: SDKControl) => void = sdk => {
    if (this._sdk !== null) {
      this._diag.warn('previously registered sdk will be overwritten');
    }
    this._sdk = sdk;
  };

  public clear: () => void = () => {
    if (this._sdk === null) {
      this._diag.warn('sdk already cleared, this is a no-op');
    }
    this._sdk = null;
  };

  public registered: () => SDKControl | null = () => {
    return this._sdk;
  };
}

export const registry = new Registry();
