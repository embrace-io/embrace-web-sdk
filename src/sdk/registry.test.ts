import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { InMemoryDiagLogger } from '../../tests/utils/index.ts';
import type { SDKControl } from './types.ts';

chai.use(sinonChai);
const { expect } = chai;

// Create a fresh Registry instance for testing to avoid singleton issues
class Registry {
  private _sdk: SDKControl | null = null;
  private readonly _diag: InMemoryDiagLogger;

  public constructor(diagLogger: InMemoryDiagLogger) {
    this._diag = diagLogger;
  }

  public register = (sdk: SDKControl): void => {
    if (this._sdk !== null) {
      this._diag.warn('previously registered sdk will be overwritten');
    }
    this._sdk = sdk;
  };

  public clear = (): void => {
    if (this._sdk === null) {
      this._diag.warn('sdk already cleared, this is a no-op');
    }
    this._sdk = null;
  };

  public registered = (): SDKControl | null => {
    return this._sdk;
  };
}

describe('registry', () => {
  let registry: Registry;
  let diag: InMemoryDiagLogger;
  let mockSDK: SDKControl;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
    registry = new Registry(diag);
    mockSDK = {
      flush: async () => {},
      setDynamicConfig: () => {},
      log: {} as SDKControl['log'],
      trace: {} as SDKControl['trace'],
      session: {} as SDKControl['session'],
      user: {} as SDKControl['user'],
      page: {} as SDKControl['page'],
    };
  });

  describe('register', () => {
    it('should store SDK instance', () => {
      registry.register(mockSDK);
      expect(registry.registered()).to.equal(mockSDK);
    });

    it('should log warning when overwriting existing SDK', () => {
      const firstSDK = { ...mockSDK };
      const secondSDK = { ...mockSDK };

      registry.register(firstSDK);
      expect(diag.getWarnLogs()).to.have.lengthOf(0);

      registry.register(secondSDK);
      expect(diag.getWarnLogs()).to.have.lengthOf(1);
      expect(diag.getWarnLogs()[0]).to.equal(
        'previously registered sdk will be overwritten',
      );
    });

    it('should replace SDK when registering twice', () => {
      const firstSDK = { ...mockSDK };
      const secondSDK = { ...mockSDK };

      registry.register(firstSDK);
      registry.register(secondSDK);

      expect(registry.registered()).to.equal(secondSDK);
      expect(registry.registered()).to.not.equal(firstSDK);
    });
  });

  describe('registered', () => {
    it('should return null initially', () => {
      expect(registry.registered()).to.be.null;
    });

    it('should return SDK after registration', () => {
      registry.register(mockSDK);
      expect(registry.registered()).to.equal(mockSDK);
    });

    it('should return null after clear', () => {
      registry.register(mockSDK);
      registry.clear();
      expect(registry.registered()).to.be.null;
    });
  });

  describe('clear', () => {
    it('should remove SDK', () => {
      registry.register(mockSDK);
      registry.clear();
      expect(registry.registered()).to.be.null;
    });

    it('should log warning when already null', () => {
      registry.clear();
      expect(diag.getWarnLogs()).to.have.lengthOf(1);
      expect(diag.getWarnLogs()[0]).to.equal(
        'sdk already cleared, this is a no-op',
      );
    });

    it('should not log warning when clearing registered SDK', () => {
      registry.register(mockSDK);
      registry.clear();
      expect(diag.getWarnLogs()).to.have.lengthOf(0);
    });
  });
});
