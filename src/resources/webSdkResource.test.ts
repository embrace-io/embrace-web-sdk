import * as chai from 'chai';
import { getWebSDKResource, SDK_VERSION } from '../resources/index.js';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../testUtils/index.js';
import { EMBRACE_APP_INSTANCE_ID_STORAGE_KEY } from './constants/index.js';

const { expect } = chai;

const VALID_UUID = 'aaaaBBBBccccDDDDeeeeFFFFggggHHHH';

describe('webSdkResource', () => {
  let storage: InMemoryStorage;
  let diagLogger: InMemoryDiagLogger;

  beforeEach(() => {
    storage = new InMemoryStorage();
    diagLogger = new InMemoryDiagLogger();
  });

  it('should include the correct sync attributes', () => {
    const resource = getWebSDKResource({
      diagLogger,
      pageSessionStorage: storage,
    });

    const appInstanceId = resource.attributes['emb.app_instance_id'];
    expect(resource.attributes).to.deep.equal({
      app_framework: 1,
      app_version: 'EmbIOAppVersionX.X.X',
      bundle_id: 'EmbIOBundleIDfd6996f1007b363f87a',
      'emb.app_instance_id': appInstanceId,
      sdk_platform: 'web',
      sdk_simple_version: 1,
      sdk_version: SDK_VERSION,
      'service.name': 'embrace-web-sdk',
      'telemetry.sdk.language': 'webjs',
      'telemetry.sdk.name': 'embrace-web-sdk',
      'telemetry.sdk.version': SDK_VERSION,
    });
  });

  it('should allow the app version to be overridden', () => {
    const resource = getWebSDKResource({
      diagLogger,
      pageSessionStorage: storage,
      appVersion: '3.4.2',
    });

    expect(resource.attributes.app_version).to.be.equal('3.4.2');
  });

  it('should restore an app instance id if there is one in storage', () => {
    storage.setItem(EMBRACE_APP_INSTANCE_ID_STORAGE_KEY, VALID_UUID);
    const resource = getWebSDKResource({
      diagLogger,
      pageSessionStorage: storage,
    });

    expect(resource.attributes['emb.app_instance_id']).to.be.equal(VALID_UUID);
  });

  it('should generate and store a new app instance id if there is not one in storage', () => {
    const resource = getWebSDKResource({
      diagLogger,
      pageSessionStorage: storage,
    });

    const appInstanceId = resource.attributes['emb.app_instance_id'];
    void expect(appInstanceId).to.have.lengthOf(32);
    expect(storage.getItem(EMBRACE_APP_INSTANCE_ID_STORAGE_KEY)).to.equal(
      appInstanceId
    );
  });

  it('should handle being setup with a non-functional storage', () => {
    const resource = getWebSDKResource({
      diagLogger,
      // @ts-expect-error dealing with potential restricted browser environments where storage APIs are unavailable
      pageSessionStorage: null,
    });

    const appInstanceId = resource.attributes['emb.app_instance_id'];
    void expect(appInstanceId).to.have.lengthOf(32);

    expect(diagLogger.getWarnLogs()).to.deep.equal([
      'Failed to retrieve app instance ID from session storage',
      'Failed to persist app instance ID to session storage',
    ]);
  });

  it('should handle its storage throwing errors', () => {
    const resource = getWebSDKResource({
      diagLogger,
      pageSessionStorage: new FailingStorage(),
    });

    const appInstanceId = resource.attributes['emb.app_instance_id'];
    void expect(appInstanceId).to.have.lengthOf(32);

    expect(diagLogger.getWarnLogs()).to.deep.equal([
      'Failed to retrieve app instance ID from session storage',
      'Failed to persist app instance ID to session storage',
    ]);
  });
});
