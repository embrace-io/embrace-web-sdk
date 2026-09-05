import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../tests/utils/index.ts';
import {
  getWebSDKOverridableResource,
  getWebSDKResource,
  SDK_VERSION,
} from '../resources/index.ts';
import { NamespacedStorage } from '../utils/index.ts';
import {
  EMBRACE_APP_INSTANCE_ID_STORAGE_KEY,
  EMBRACE_SERVICE_NAME,
} from './constants/index.ts';

const { expect } = chai;

const VALID_UUID = 'aaaaBBBBccccDDDDeeeeFFFFggggHHHH';

describe('webSdkResource', () => {
  let inMemoryStorage: InMemoryStorage;
  let storage: NamespacedStorage;
  let diagLogger: InMemoryDiagLogger;
  let restorers: (() => void)[];

  const stubProp = (target: object, property: string, get: () => unknown) => {
    const original = Object.getOwnPropertyDescriptor(target, property);
    Object.defineProperty(target, property, { configurable: true, get });
    restorers.push(() => {
      if (original) {
        Object.defineProperty(target, property, original);
      } else {
        Reflect.deleteProperty(target, property);
      }
    });
  };

  beforeEach(() => {
    inMemoryStorage = new InMemoryStorage();
    diagLogger = new InMemoryDiagLogger();
    storage = new NamespacedStorage({
      storage: inMemoryStorage,
      diag: diagLogger,
    });
    restorers = [];
  });

  afterEach(() => {
    for (const restore of restorers) {
      restore();
    }
  });

  describe('getWebSDKResource', () => {
    it('should include the correct sync attributes', () => {
      stubProp(window, 'innerWidth', () => 1024);
      stubProp(window, 'innerHeight', () => 768);
      stubProp(window.navigator, 'connection', () => ({
        effectiveType: '4g',
      }));
      stubProp(window.navigator, 'deviceMemory', () => 8);
      stubProp(window.navigator, 'webdriver', () => true);

      const resource = getWebSDKResource({
        diagLogger,
        appVersion: 'EmbIOAppVersionX.X.X',
        tabStorage: storage,
      });

      const appInstanceId = resource.attributes['emb.app_instance_id'];
      expect(resource.attributes).to.deep.equal({
        app_framework: 1,
        app_version: 'EmbIOAppVersionX.X.X',
        'emb.app_instance_id': appInstanceId,
        sdk_platform: 'web',
        sdk_simple_version: 1,
        sdk_version: SDK_VERSION,
        'telemetry.sdk.language': 'webjs',
        'telemetry.sdk.name': 'embrace-web-sdk',
        'telemetry.sdk.version': SDK_VERSION,
        'user_agent.original': window.navigator.userAgent,
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        viewport_resolution: '1024x768',
        network_effective_type: '4g',
        device_memory: 8,
        webdriver: true,
      });
    });

    it('should omit network_effective_type and device_memory when the browser does not support them', () => {
      stubProp(window.navigator, 'connection', () => undefined);
      stubProp(window.navigator, 'deviceMemory', () => undefined);

      const resource = getWebSDKResource({
        diagLogger,
        appVersion: '1.0.0',
        tabStorage: storage,
      });

      expect(resource.attributes).to.not.have.property(
        'network_effective_type',
      );
      expect(resource.attributes).to.not.have.property('device_memory');
    });

    it('should use the provided appVersion', () => {
      const resource = getWebSDKResource({
        diagLogger,
        appVersion: '3.4.2',
        tabStorage: storage,
      });

      expect(resource.attributes['app_version']).to.equal('3.4.2');
    });

    it('should restore an app instance id if there is one in storage', () => {
      storage.setItem(EMBRACE_APP_INSTANCE_ID_STORAGE_KEY, VALID_UUID);
      const resource = getWebSDKResource({
        diagLogger,
        appVersion: '1.0.0',
        tabStorage: storage,
      });

      expect(resource.attributes['emb.app_instance_id']).to.be.equal(
        VALID_UUID,
      );
    });

    it('should generate and store a new app instance id if there is not one in storage', () => {
      const resource = getWebSDKResource({
        diagLogger,
        appVersion: '1.0.0',
        tabStorage: storage,
      });

      const appInstanceId = resource.attributes['emb.app_instance_id'];
      void expect(appInstanceId).to.have.lengthOf(32);
      expect(storage.getItem(EMBRACE_APP_INSTANCE_ID_STORAGE_KEY)).to.equal(
        appInstanceId,
      );
    });

    it('should handle its storage throwing errors', () => {
      const failingStorage = new NamespacedStorage({
        storage: new FailingStorage(),
        diag: diagLogger,
      });
      const resource = getWebSDKResource({
        diagLogger,
        appVersion: '1.0.0',
        tabStorage: failingStorage,
      });

      const appInstanceId = resource.attributes['emb.app_instance_id'];
      void expect(appInstanceId).to.have.lengthOf(32);

      // Read fails: NamespacedStorage warns.
      // Write fails: NamespacedStorage flips disabled and emits one error.
      expect(diagLogger.getWarnLogs()).to.have.lengthOf(1);
      expect(diagLogger.getWarnLogs()[0]).to.contain('failed to read');
      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.contain('writes disabled');
    });
  });

  describe('getWebSDKOverridableResource', () => {
    it('should include the default overridable attributes', () => {
      const resource = getWebSDKOverridableResource();

      expect(resource.attributes).to.deep.equal({
        [ATTR_SERVICE_NAME]: EMBRACE_SERVICE_NAME,
      });
    });
  });
});
