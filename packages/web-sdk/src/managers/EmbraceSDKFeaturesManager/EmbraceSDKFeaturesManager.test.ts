import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  NOT_SAMPLED_UUID,
  SAMPLED_UUID,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../tests/utils/constants.ts';
import { EmbraceSDKFeaturesManager } from './EmbraceSDKFeaturesManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceSDKFeaturesManager', () => {
  let manager: EmbraceSDKFeaturesManager;

  it('should return true if the device is sampled', () => {
    manager = new EmbraceSDKFeaturesManager({
      deviceId: SAMPLED_UUID,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      blockNetworkSpanForwarding: false,
    });

    void expect(manager.isSDKEnabled()).to.be.true;
  });

  it('should return false if the device is not sampled', () => {
    manager = new EmbraceSDKFeaturesManager({
      deviceId: NOT_SAMPLED_UUID,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      blockNetworkSpanForwarding: false,
    });

    void expect(manager.isSDKEnabled()).to.be.false;
  });

  it('should return true if the device is enabled for network span forwarding', () => {
    manager = new EmbraceSDKFeaturesManager({
      deviceId: SAMPLED_UUID,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      blockNetworkSpanForwarding: false,
    });

    void expect(manager.isNetworkSpanForwardingEnabled()).to.be.true;
  });

  it('should return false if the device is not enabled for network span forwarding', () => {
    manager = new EmbraceSDKFeaturesManager({
      deviceId: NOT_SAMPLED_UUID,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      blockNetworkSpanForwarding: false,
    });

    void expect(manager.isNetworkSpanForwardingEnabled()).to.be.false;
  });

  it('should return false if the networkSpansForwardingThreshold is not specified at all', () => {
    manager = new EmbraceSDKFeaturesManager({
      deviceId: SAMPLED_UUID,
      dynamicConfigManager: {
        refreshRemoteConfig: sinon.stub(),
        setConfig: sinon.stub(),
        getConfig: () => ({
          samplingPct: 50,
        }),
      },
      blockNetworkSpanForwarding: false,
    });
    void expect(manager.isNetworkSpanForwardingEnabled()).to.be.false;
  });

  it('should return false if the device is enabled for network span forwarding but the feature is blocked', () => {
    manager = new EmbraceSDKFeaturesManager({
      deviceId: SAMPLED_UUID,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      blockNetworkSpanForwarding: true,
    });

    void expect(manager.isNetworkSpanForwardingEnabled()).to.be.false;
  });
});
