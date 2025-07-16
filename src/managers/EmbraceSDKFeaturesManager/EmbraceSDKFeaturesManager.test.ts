import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { EmbraceSDKFeaturesManager } from './EmbraceSDKFeaturesManager.js';
import type { DynamicConfigManager } from '../../sdk/index.js';
import { NOT_SAMPLED_UUID, SAMPLED_UUID } from '../../testUtils/index.js';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceSDKFeaturesManager', () => {
  let manager: EmbraceSDKFeaturesManager;
  const baseDynamicConfigManager: DynamicConfigManager = {
    refreshRemoteConfig: sinon.stub(),
    setConfig: sinon.stub(),
    getConfig: () => ({
      samplingPct: 50,
    }),
  };

  it('should return true if the device is sampled', () => {
    manager = new EmbraceSDKFeaturesManager({
      deviceId: SAMPLED_UUID,
      dynamicConfigManager: baseDynamicConfigManager,
    });

    void expect(manager.isSDKEnabled()).to.be.true;
  });

  it('should return false if the device is not sampled', () => {
    manager = new EmbraceSDKFeaturesManager({
      deviceId: NOT_SAMPLED_UUID,
      dynamicConfigManager: baseDynamicConfigManager,
    });

    void expect(manager.isSDKEnabled()).to.be.false;
  });
});
