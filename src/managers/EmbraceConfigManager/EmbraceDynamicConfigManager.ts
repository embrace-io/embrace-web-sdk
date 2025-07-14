import type {
  RemoteConfig,
  RemoteConfigManagerArgs,
  StoredRemoteConfig,
} from './types.js';
import { getConfigURL } from './utils.js';
import { diag } from '@opentelemetry/api';
import type { DiagLogger } from '@opentelemetry/api';
import {
  DEFAULT_CONFIG,
  LOCAL_STORAGE_REMOTE_CONFIG_KEY,
} from './constants.js';
import type {
  DynamicConfigManager,
  DynamicSDKConfig,
} from '../../sdk/index.js';

export class EmbraceDynamicConfigManager implements DynamicConfigManager {
  // Set to null if appID is not provided, in that case only rely on local config
  private readonly _remoteConfigURL: string | null = null;
  private readonly _diag: DiagLogger;
  private readonly _storage: Storage;

  private _sdkConfig: DynamicSDKConfig;
  private _etag: string | null = null;

  public constructor({
    appID,
    appVersion,
    deviceId,
    diag: diagParam = diag.createComponentLogger({
      namespace: 'embrace-config-manager',
    }),
    storage = localStorage,
    // Allow users to provide a default config
    defaultConfig = {},
  }: RemoteConfigManagerArgs = {}) {
    if (appID && appVersion && deviceId) {
      this._remoteConfigURL = getConfigURL(appID, {
        appVersion,
        deviceId,
        // TODO: Replace with actual OS version once we start capturing it
        osVersion: '1',
      });
    }

    this._diag = diagParam;
    this._storage = storage;

    const storedRemoteConfig = this._getRemoteConfigFromStorage();

    if (storedRemoteConfig) {
      this._etag = storedRemoteConfig.etag;
    }

    this._sdkConfig = {
      // Merge the default config with any user-provided defaults
      // making sure user-provided values take precedence
      ...DEFAULT_CONFIG,
      ...defaultConfig,
      // Stored remote config values will override both defaults and user-provided defaults
      ...(storedRemoteConfig ? storedRemoteConfig.config : {}),
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
        this._remoteConfigURL
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
        } as StoredRemoteConfig)
      );

      this._sdkConfig = remoteConfig;
      this._etag = etag;
    } catch (error: unknown) {
      this._diag.warn(
        `Failed to refresh remote config: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private _getRemoteConfigFromStorage(): StoredRemoteConfig | null {
    try {
      const configString = this._storage.getItem(
        LOCAL_STORAGE_REMOTE_CONFIG_KEY
      );

      if (configString) {
        return JSON.parse(configString) as StoredRemoteConfig;
      }

      return null;
    } catch (error) {
      this._diag.warn(
        `Failed to parse remote config from storage: ${error instanceof Error ? error.message : String(error)}`
      );

      return null;
    }
  }

  private async _fetchRemoteConfig(
    url: string
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
        `Failed to fetch remote config from ${url}: ${response.statusText}`
      );

      return null;
    }

    const remoteConfig = (await response.json()) as RemoteConfig;

    return [remoteConfig, etag];
  }
}
