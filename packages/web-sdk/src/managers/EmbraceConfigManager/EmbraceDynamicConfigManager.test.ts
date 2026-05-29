import * as chai from 'chai';
import {
  fakeFetchGetRequestHeaders,
  fakeFetchGetUrl,
  fakeFetchInstall,
  fakeFetchResetHistory,
  fakeFetchRespondWith,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../../tests/utils/index.ts';
import { NamespacedStorage } from '../../utils/index.ts';
import { LOCAL_STORAGE_REMOTE_CONFIG_KEY } from './constants.ts';
import { EmbraceDynamicConfigManager } from './EmbraceDynamicConfigManager.ts';

const { expect } = chai;

describe('EmbraceDynamicConfigManager', () => {
  let diag: InMemoryDiagLogger;
  let inMemoryStorage: InMemoryStorage;
  let storage: NamespacedStorage;

  before(() => {
    fakeFetchInstall();
  });

  beforeEach(() => {
    inMemoryStorage = new InMemoryStorage();
    diag = new InMemoryDiagLogger();
    storage = new NamespacedStorage({ storage: inMemoryStorage, diag });

    fakeFetchResetHistory();
    storage.clear();
  });

  it('should set the config using setConfig method', () => {
    const configManager = new EmbraceDynamicConfigManager({
      storage,
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
    const configManager = new EmbraceDynamicConfigManager({ storage });

    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 100,
      networkSpansForwardingThreshold: 0,
    });
  });

  it('should get the user-provided config for an app not connected to Embrace', () => {
    const configManager = new EmbraceDynamicConfigManager({
      storage,
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

  it('should parse user-session durations from remote config', () => {
    storage.setItem(
      LOCAL_STORAGE_REMOTE_CONFIG_KEY,
      JSON.stringify({
        etag: null,
        config: {
          threshold: 100,
          user_session: {
            max_duration_seconds: 7200,
            inactivity_timeout_seconds: 120,
          },
        },
      }),
    );

    const configManager = new EmbraceDynamicConfigManager({ storage });

    const config = configManager.getConfig();

    expect(config.userSessionMaxDurationSeconds).to.equal(7200);
    expect(config.userSessionInactivityTimeoutSeconds).to.equal(120);
  });

  it('should parse the web foreground inactivity timeout from remote config', () => {
    storage.setItem(
      LOCAL_STORAGE_REMOTE_CONFIG_KEY,
      JSON.stringify({
        etag: null,
        config: {
          threshold: 100,
          user_session: {
            web_foreground_inactivity_timeout_seconds: 90,
          },
        },
      }),
    );

    const configManager = new EmbraceDynamicConfigManager({ storage });

    const config = configManager.getConfig();

    expect(config.userSessionForegroundInactivityTimeoutSeconds).to.equal(90);
  });

  it('should leave the foreground inactivity timeout undefined when absent', () => {
    storage.setItem(
      LOCAL_STORAGE_REMOTE_CONFIG_KEY,
      JSON.stringify({
        etag: null,
        config: {
          threshold: 100,
          user_session: {
            inactivity_timeout_seconds: 120,
          },
        },
      }),
    );

    const configManager = new EmbraceDynamicConfigManager({ storage });

    const config = configManager.getConfig();

    void expect(config.userSessionForegroundInactivityTimeoutSeconds).to.be
      .undefined;
  });

  it('should leave the omitted user-session field undefined when only one is sent', () => {
    storage.setItem(
      LOCAL_STORAGE_REMOTE_CONFIG_KEY,
      JSON.stringify({
        etag: null,
        config: {
          threshold: 100,
          user_session: {
            max_duration_seconds: 7200,
          },
        },
      }),
    );

    const configManager = new EmbraceDynamicConfigManager({ storage });

    const config = configManager.getConfig();

    expect(config.userSessionMaxDurationSeconds).to.equal(7200);
    void expect(config.userSessionInactivityTimeoutSeconds).to.be.undefined;
  });

  it('should leave both user-session fields undefined when the block is absent', () => {
    storage.setItem(
      LOCAL_STORAGE_REMOTE_CONFIG_KEY,
      JSON.stringify({
        etag: null,
        config: {
          threshold: 100,
        },
      }),
    );

    const configManager = new EmbraceDynamicConfigManager({ storage });

    const config = configManager.getConfig();

    void expect(config.userSessionMaxDurationSeconds).to.be.undefined;
    void expect(config.userSessionInactivityTimeoutSeconds).to.be.undefined;
  });

  it('should not fail if storage is not available', () => {
    const configManager = new EmbraceDynamicConfigManager({
      storage: new NamespacedStorage({
        // @ts-expect-error dealing with potential restricted browser environments where storage APIs are unavailable
        storage: null,
        diag,
      }),
      diag,
    });

    const config = configManager.getConfig();

    expect(config).to.deep.equal({
      samplingPct: 100,
      networkSpansForwardingThreshold: 0,
    });
    expect(
      diag
        .getWarnLogs()
        .some((m) =>
          m.includes(`failed to read ${LOCAL_STORAGE_REMOTE_CONFIG_KEY}`),
        ),
    ).to.equal(true);
  });

  it('should not fetch the remote config if is not connected to Embrace', async () => {
    const configManager = new EmbraceDynamicConfigManager({ storage });

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
      networkSpansForwardingThreshold: 0,
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
      networkSpansForwardingThreshold: 0,
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
      networkSpansForwardingThreshold: 0,
    });
    expect(fakeFetchGetUrl()).to.equal(
      `https://custom-config-url.com/config/v2/config?appId=test-app&osVersion=1&appVersion=1.0.0&deviceId=test-device`,
    );
  });
});
