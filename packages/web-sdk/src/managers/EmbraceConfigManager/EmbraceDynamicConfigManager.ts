import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type {
  DynamicConfigManager,
  DynamicSDKConfig,
} from '../../sdk/index.ts';
import {
  DEFAULT_CONFIG,
  LOCAL_STORAGE_REMOTE_CONFIG_KEY,
} from './constants.ts';
import type {
  EmbraceDynamicConfigManagerArgs,
  RemoteConfig,
  StoredRemoteConfig,
} from './types.ts';
import { getConfigURL } from './utils.ts';

const parseRemoteConfig = (remoteConfig: RemoteConfig): DynamicSDKConfig => {
  const parsed: DynamicSDKConfig = {
    samplingPct: remoteConfig.threshold,
  };

  if (remoteConfig.network_span_forwarding !== undefined) {
    parsed.networkSpansForwardingThreshold =
      remoteConfig.network_span_forwarding.pct_enabled;
  }

  return parsed;
};

export class EmbraceDynamicConfigManager implements DynamicConfigManager {
  // Set to null if appID is not provided, in that case only rely on local config
  private readonly _remoteConfigURL: string | null = null;
  private readonly _diag: DiagLogger;
  private readonly _storage: Storage;
  private readonly _baseConfig: DynamicSDKConfig;

  private _sdkConfig: DynamicSDKConfig;
  private _etag: string | null = null;

  public constructor({
    appID,
    appVersion,
    deviceId,
    diag: diagParam = diag.createComponentLogger({
      namespace: 'embrace-config-manager',
    }),
    storage,
    // Allow users to provide a default config
    defaultConfig = {},
    embraceConfigURL,
  }: EmbraceDynamicConfigManagerArgs) {
    if (appID && appVersion && deviceId) {
      this._remoteConfigURL = getConfigURL(
        appID,
        {
          appVersion,
          deviceId,
          // TODO: Replace with actual OS version once we start capturing it
          osVersion: '1',
        },
        embraceConfigURL,
      );
    }

    this._diag = diagParam;
    this._storage = storage;

    const storedRemoteConfig = this._getRemoteConfigFromStorage();

    if (storedRemoteConfig) {
      this._etag = storedRemoteConfig.etag;
    }

    // Default config merged with any user-provided defaults; user-provided values take precedence.
    // Kept around so refreshRemoteConfig can re-merge against it instead of dropping defaults.
    this._baseConfig = {
      ...DEFAULT_CONFIG,
      ...defaultConfig,
    };

    this._sdkConfig = {
      ...this._baseConfig,
      // Stored remote config values will override both defaults and user-provided defaults
      ...(storedRemoteConfig
        ? parseRemoteConfig(storedRemoteConfig.config)
        : {}),
    };
  }

  public setConfig(config: Partial<DynamicSDKConfig>): void {
    this._sdkConfig = {
      ...this._sdkConfig,
      ...config,
    };
  }

  public getConfig(): DynamicSDKConfig {
    return this._sdkConfig;
  }

  // No-op if not sending data to embrace
  public async refreshRemoteConfig(): Promise<void> {
    if (!this._remoteConfigURL) {
      return;
    }

    try {
      const remoteConfigResponse = await this._fetchRemoteConfig(
        this._remoteConfigURL,
      );

      if (!remoteConfigResponse) {
        this._diag.debug('No changes in remote config, skipping update');
        return;
      }

      const [remoteConfig, etag] = remoteConfigResponse;
      this._storage.setItem(
        LOCAL_STORAGE_REMOTE_CONFIG_KEY,
        JSON.stringify({
          config: remoteConfig,
          etag,
        } as StoredRemoteConfig),
      );

      this._sdkConfig = {
        ...this._baseConfig,
        ...parseRemoteConfig(remoteConfig),
      };
      this._etag = etag;
    } catch (error: unknown) {
      this._diag.warn(
        `Failed to refresh remote config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private _getRemoteConfigFromStorage(): StoredRemoteConfig | null {
    try {
      const configString = this._storage.getItem(
        LOCAL_STORAGE_REMOTE_CONFIG_KEY,
      );

      if (configString) {
        return JSON.parse(configString) as StoredRemoteConfig;
      }

      return null;
    } catch (error) {
      this._diag.warn(
        `Failed to parse remote config from storage: ${error instanceof Error ? error.message : String(error)}`,
      );

      return null;
    }
  }

  private async _fetchRemoteConfig(
    url: string,
  ): Promise<[RemoteConfig, string | null] | null> {
    const response = await fetch(url, {
      headers: this._etag ? { 'If-None-Match': this._etag } : {},
    });

    const etag = response.headers.get('etag');

    // Nothing changed, return null
    if (response.status === 304) {
      return null;
    }

    if (!response.ok) {
      this._diag.warn(
        `Failed to fetch remote config from ${url}: ${response.statusText}`,
      );

      return null;
    }

    const remoteConfig = (await response.json()) as RemoteConfig;

    return [remoteConfig, etag];
  }
}
