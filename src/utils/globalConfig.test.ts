import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { GLOBAL_CONFIG } from './globalConfig.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('globalConfig', () => {
  describe('GLOBAL_CONFIG', () => {
    it('should reference globalThis', () => {
      // GLOBAL_CONFIG is a typed reference to globalThis
      expect(GLOBAL_CONFIG).to.equal(globalThis);
    });

    it('should allow setting _EmbraceFileBundleIDs', () => {
      const bundleIds = {
        'file1.js': 'bundle-id-1',
        'file2.js': 'bundle-id-2',
      };

      GLOBAL_CONFIG._EmbraceFileBundleIDs = bundleIds;

      expect(GLOBAL_CONFIG._EmbraceFileBundleIDs).to.deep.equal(bundleIds);

      // Cleanup
      delete GLOBAL_CONFIG._EmbraceFileBundleIDs;
    });

    it('should allow _EmbraceFileBundleIDs to be undefined', () => {
      delete GLOBAL_CONFIG._EmbraceFileBundleIDs;
      expect(GLOBAL_CONFIG._EmbraceFileBundleIDs).to.be.undefined;
    });
  });
});
