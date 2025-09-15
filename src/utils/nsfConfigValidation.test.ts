import * as chai from 'chai';
import {
  InMemoryDiagLogger,
  NOT_SAMPLED_UUID,
  SAMPLED_UUID,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../testUtils/index.js';
import { nsfConfigValidation } from './nsfConfigValidation.js';
import { EmbraceSDKFeaturesManager } from '../managers/index.js';
import { CompositePropagator } from '@opentelemetry/core';

const { expect } = chai;

describe('nsfConfigValidation', () => {
  let diag: InMemoryDiagLogger;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
  });

  it('should return false if the feature is turned off through dynamic configuration', () => {
    const featureManager = new EmbraceSDKFeaturesManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      deviceId: NOT_SAMPLED_UUID,
      blockNetworkSpanForwarding: false,
    });

    expect(
      nsfConfigValidation({
        diag,
        featureManager,
        registerGlobally: true,
      })
    ).to.equal(false);
    expect(diag.getWarnLogs().length).to.equal(0);
  });

  it('should return false if the feature is off through the block config', () => {
    const featureManager = new EmbraceSDKFeaturesManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      deviceId: SAMPLED_UUID,
      blockNetworkSpanForwarding: true,
    });

    expect(
      nsfConfigValidation({
        diag,
        featureManager,
        registerGlobally: true,
      })
    ).to.equal(false);
    expect(diag.getWarnLogs().length).to.equal(0);
  });

  it('should return true if the feature is on and the config is valid', () => {
    const featureManager = new EmbraceSDKFeaturesManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      deviceId: SAMPLED_UUID,
      blockNetworkSpanForwarding: false,
    });

    expect(
      nsfConfigValidation({
        diag,
        featureManager,
        registerGlobally: true,
      })
    ).to.equal(true);
    expect(diag.getWarnLogs().length).to.equal(0);
  });

  it('should warn about not registering globally', () => {
    const featureManager = new EmbraceSDKFeaturesManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      deviceId: SAMPLED_UUID,
      blockNetworkSpanForwarding: false,
    });

    expect(
      nsfConfigValidation({
        diag,
        featureManager,
        registerGlobally: false,
      })
    ).to.equal(false);
    expect(diag.getWarnLogs()).to.deep.equal([
      'Network span forwarding cannot be used when `registerGlobally` is set to false. Turning off network span forwarding.',
    ]);
  });

  it('should warn when a custom propagator is set', () => {
    const featureManager = new EmbraceSDKFeaturesManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      deviceId: SAMPLED_UUID,
      blockNetworkSpanForwarding: false,
    });

    expect(
      nsfConfigValidation({
        diag,
        featureManager,
        propagator: new CompositePropagator(),
        registerGlobally: true,
      })
    ).to.equal(false);
    expect(diag.getWarnLogs()).to.deep.equal([
      'Network span forwarding cannot be used alongside a custom `propagator`. Turning off network span forwarding.',
    ]);
  });

  it('should warn when the xhr and fetch instrumentations are omitted', () => {
    const featureManager = new EmbraceSDKFeaturesManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      deviceId: SAMPLED_UUID,
      blockNetworkSpanForwarding: false,
    });

    expect(
      nsfConfigValidation({
        diag,
        featureManager,
        registerGlobally: true,
        defaultInstrumentationConfig: {
          omit: new Set([
            '@opentelemetry/instrumentation-xml-http-request',
            '@opentelemetry/instrumentation-fetch',
          ]),
        },
      })
    ).to.equal(false);
    expect(diag.getWarnLogs()).to.deep.equal([
      "Network span forwarding cannot be used when both '@opentelemetry/instrumentation-xml-http-request' and '@opentelemetry/instrumentation-fetch' are omitted. Turning off network span forwarding.",
    ]);
  });

  it('should consider the configuration valid when only one of the network instrumentations is omitted', () => {
    const featureManager = new EmbraceSDKFeaturesManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      deviceId: SAMPLED_UUID,
      blockNetworkSpanForwarding: false,
    });

    expect(
      nsfConfigValidation({
        diag,
        featureManager,
        registerGlobally: true,
        defaultInstrumentationConfig: {
          omit: new Set(['@opentelemetry/instrumentation-xml-http-request']),
        },
      })
    ).to.equal(true);
    expect(diag.getWarnLogs()).to.deep.equal([]);
  });

  it('should warn when there are multiple configuration issues', () => {
    const featureManager = new EmbraceSDKFeaturesManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      deviceId: SAMPLED_UUID,
      blockNetworkSpanForwarding: false,
    });

    expect(
      nsfConfigValidation({
        diag,
        featureManager,
        propagator: new CompositePropagator(),
        registerGlobally: false,
      })
    ).to.equal(false);
    expect(diag.getWarnLogs()).to.deep.equal([
      'Network span forwarding cannot be used when `registerGlobally` is set to false. Turning off network span forwarding.',
      'Network span forwarding cannot be used alongside a custom `propagator`. Turning off network span forwarding.',
    ]);
  });
});
