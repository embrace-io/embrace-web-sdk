import * as chai from 'chai';
import {
  fakeFetchGetRequestHeaders,
  fakeFetchGetUrl,
  fakeFetchInstall,
  fakeFetchResetHistory,
  fakeFetchRespondWith,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../testUtils/index.js';
import { LOCAL_STORAGE_REMOTE_CONFIG_KEY } from './constants.js';
import { EmbraceDynamicConfigManager } from './EmbraceDynamicConfigManager.js';

const { expect } = chai;

describe('EmbraceDynamicConfigManager', () => {
  let diag: InMemoryDiagLogger;
  let storage: InMemoryStorage;

  before(() => {
    fakeFetchInstall();
  });

  beforeEach(() => {
    storage = new InMemoryStorage();
    diag = new InMemoryDiagLogger();

    fakeFetchResetHistory();
    storage.clear();
  });

  it('should set the config using setConfig method', () => {
    const configManager = new EmbraceDynamicConfigManager({
      defaultConfig: {
        samplingPct: 50,
      },
    });

    configManager.setConfig({ samplingPct: 30 });

    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 30,
      networkSpansForwardingThreshold: 0,
    });
  });

  it('should get the default config for an app not connected to Embrace', () => {
    const configManager = new EmbraceDynamicConfigManager();

    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 100,
      networkSpansForwardingThreshold: 0,
    });
  });

  it('should get the user-provided config for an app not connected to Embrace', () => {
    const configManager = new EmbraceDynamicConfigManager({
      defaultConfig: {
        samplingPct: 50,
      },
    });

    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 50,
      networkSpansForwardingThreshold: 0,
    });
  });

  it('should get the remote stored config for an app connected to Embrace', () => {
    storage.setItem(
      LOCAL_STORAGE_REMOTE_CONFIG_KEY,
      JSON.stringify({
        etag: null,
        config: {
          threshold: 75,
        },
      }),
    );

    const configManager = new EmbraceDynamicConfigManager({
      storage,
      defaultConfig: {
        samplingPct: 50,
      },
    });

    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 75,
      networkSpansForwardingThreshold: 0,
    });
  });

  it('should not fail if storage is not available', () => {
    const configManager = new EmbraceDynamicConfigManager({
      // @ts-expect-error dealing with potential restricted browser environments where storage APIs are unavailable
      storage: null,
      diag,
    });

    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 100,
      networkSpansForwardingThreshold: 0,
    });
    expect(diag.getWarnLogs()[0]).to.contain(
      'Failed to parse remote config from storage',
    );
  });

  it('should not fetch the remote config if is not connected to Embrace', async () => {
    const configManager = new EmbraceDynamicConfigManager();

    await configManager.refreshRemoteConfig();

    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 100,
      networkSpansForwardingThreshold: 0,
    });
  });

  it('should fetch and parse the remote config and update the stored config', async () => {
    fakeFetchRespondWith(
      JSON.stringify({
        threshold: 80,
      }),
      {
        status: 200,
      },
    );

    const configManager = new EmbraceDynamicConfigManager({
      appID: 'test-app',
      appVersion: '1.0.0',
      deviceId: 'test-device',
      storage,
      diag,
    });

    await configManager.refreshRemoteConfig();

    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 80,
    });
    expect(fakeFetchGetUrl()).to.equal(
      'https://a-test-app.config.emb-api.com/v2/config?appId=test-app&osVersion=1&appVersion=1.0.0&deviceId=test-device',
    );
  });

  it('should not throw an error if the remote config is not available or invalid', async () => {
    fakeFetchRespondWith('', {
      status: 200,
    });

    const configManager = new EmbraceDynamicConfigManager({
      appID: 'test-app',
      appVersion: '1.0.0',
      deviceId: 'test-device',
      storage,
      diag,
    });

    await configManager.refreshRemoteConfig();

    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 100,
      networkSpansForwardingThreshold: 0,
    });
    expect(diag.getWarnLogs()[0]).to.contain('Failed to refresh remote config');
  });

  it('should send etag in the request headers if available', async () => {
    fakeFetchRespondWith(
      JSON.stringify({
        threshold: 80,
      }),
      {
        status: 200,
        headers: {
          etag: 'test-etag',
        },
      },
    );

    const configManager = new EmbraceDynamicConfigManager({
      appID: 'test-app',
      appVersion: '1.0.0',
      deviceId: 'test-device',
      storage,
      diag,
    });

    // Make first request to get the etag
    await configManager.refreshRemoteConfig();

    // First request is empty since we don't have an etag yet
    expect(fakeFetchGetRequestHeaders()).to.deep.equal({});
    fakeFetchResetHistory();

    // Simulate a second request with the etag
    await configManager.refreshRemoteConfig();

    expect(fakeFetchGetRequestHeaders()).to.deep.equal({
      'If-None-Match': 'test-etag',
    });
  });

  it('should use the stored etag in the request headers, and update if it changes', async () => {
    storage.setItem(
      LOCAL_STORAGE_REMOTE_CONFIG_KEY,
      JSON.stringify({
        etag: 'stored-etag',
        config: {
          threshold: 75,
        },
      }),
    );

    fakeFetchRespondWith(
      JSON.stringify({
        threshold: 80,
      }),
      {
        status: 200,
        headers: {
          etag: 'new-etag',
        },
      },
    );

    const configManager = new EmbraceDynamicConfigManager({
      appID: 'test-app',
      appVersion: '1.0.0',
      deviceId: 'test-device',
      storage,
      diag,
    });

    await configManager.refreshRemoteConfig();
    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 80,
    });
    expect(fakeFetchGetRequestHeaders()).to.deep.equal({
      'If-None-Match': 'stored-etag',
    });
    expect(storage.getItem(LOCAL_STORAGE_REMOTE_CONFIG_KEY)).to.equal(
      JSON.stringify({ config: { threshold: 80 }, etag: 'new-etag' }),
    );
  });

  it('should not update the config if the remote config has not changed', async () => {
    storage.setItem(
      LOCAL_STORAGE_REMOTE_CONFIG_KEY,
      JSON.stringify({
        config: {
          threshold: 75,
        },
        etag: 'stored-etag',
      }),
    );

    fakeFetchRespondWith(null, {
      status: 304, // Not Modified
      statusText: 'Not Modified',
      headers: {
        ETag: '"stored-etag"',
      },
    });

    const configManager = new EmbraceDynamicConfigManager({
      appID: 'test-app',
      appVersion: '1.0.0',
      deviceId: 'test-device',
      storage,
      diag,
      defaultConfig: {
        samplingPct: 50,
      },
    });

    await configManager.refreshRemoteConfig();
    const config = configManager.getConfig();

    expect(diag.getDebugLogs()).to.deep.equal([
      'No changes in remote config, skipping update',
    ]);
    expect(config).to.deep.equal({
      samplingPct: 75,
      networkSpansForwardingThreshold: 0,
    });
    expect(fakeFetchGetRequestHeaders()).to.deep.equal({
      'If-None-Match': 'stored-etag',
    });
    expect(storage.getItem(LOCAL_STORAGE_REMOTE_CONFIG_KEY)).to.equal(
      JSON.stringify({ config: { threshold: 75 }, etag: 'stored-etag' }),
    );
  });

  it('should support a custom remote config URL', async () => {
    const customURL = 'https://custom-config-url.com/config';
    fakeFetchRespondWith(
      JSON.stringify({
        threshold: 90,
      }),
      {
        status: 200,
      },
    );

    const configManager = new EmbraceDynamicConfigManager({
      appID: 'test-app',
      appVersion: '1.0.0',
      deviceId: 'test-device',
      embraceConfigURL: customURL,
      storage,
      diag,
    });

    await configManager.refreshRemoteConfig();

    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 90,
    });
    expect(fakeFetchGetUrl()).to.equal(
      `https://custom-config-url.com/config/v2/config?appId=test-app&osVersion=1&appVersion=1.0.0&deviceId=test-device`,
    );
  });
});
