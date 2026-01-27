import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { SDKControl, SDKRegistryManager } from './types.ts';

class Registry implements SDKRegistryManager {
  private _sdk: SDKControl | null = null;
  private readonly _diag: DiagLogger;
  public hasGlobalInstance = false;
  public hasNonGlobalInstance = false;

  public constructor({
    diagLogger = diag.createComponentLogger({ namespace: 'embrace-registry' }),
  }: { diagLogger?: DiagLogger } = {}) {
    this._diag = diagLogger;
  }

  public register: (sdk: SDKControl) => void = (sdk) => {
    if (this._sdk !== null) {
      throw new Error(
        'SDK has already been registered. Call registry.clear() before re-initializing, or use registerGlobally: false for multiple instances.',
      );
    }
    this._sdk = sdk;
  };

  public clear: () => void = () => {
    if (this._sdk === null) {
      this._diag.warn('sdk already cleared, this is a no-op');
    }
    this._sdk = null;
    this.hasGlobalInstance = false;
    this.hasNonGlobalInstance = false;
  };

  public registered: () => SDKControl | null = () => {
    return this._sdk;
  };
}

export const registry = new Registry();
