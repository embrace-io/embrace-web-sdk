import type { Resource } from '@opentelemetry/resources';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_VERSION,
  ATTR_USER_AGENT_ORIGINAL,
} from '@opentelemetry/semantic-conventions';
import { KEY_EMB_APP_INSTANCE_ID } from '../constants/index.ts';
import { getAppInstanceId } from './appInstanceId.ts';
import {
  EMBRACE_SERVICE_NAME,
  NATIVE_FRAMEWORK,
  SDK_VERSION,
} from './constants/index.ts';
import type { GetWebSDKResourceArgs } from './types.ts';

/**
 * Returns resource attributes that users are allowed to override via the `resource` option in `initSDK`.
 * These defaults are applied first in the merge chain so user-provided values take precedence.
 */
export const getWebSDKOverridableResource = (): Resource => {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: EMBRACE_SERVICE_NAME,
  });
};

/**
 * Returns SDK resource attributes that must not be overridden by user-provided resources.
 * These are applied last in the merge chain so they always take precedence.
 */
export const getWebSDKResource = ({
  diagLogger,
  appVersion,
  pageSessionStorage,
}: GetWebSDKResourceArgs): Resource => {
  return resourceFromAttributes({
    [ATTR_TELEMETRY_SDK_NAME]: EMBRACE_SERVICE_NAME,
    // NOTE: `appVersion` may originate from TEMPLATE_APP_VERSION, which is padded
    // with whitespace by the CLI to keep sourcemap offsets stable. The padding is
    // intentionally trimmed earlier (see validateAppVersion in utils.ts), so by the
    // time it is passed here `appVersion` should already be a normalized value.
    app_version: appVersion,
    app_framework: NATIVE_FRAMEWORK,
    sdk_version: SDK_VERSION,
    [ATTR_TELEMETRY_SDK_VERSION]: SDK_VERSION,
    sdk_simple_version: 1,
    sdk_platform: 'web',
    [ATTR_TELEMETRY_SDK_LANGUAGE]: 'webjs',
    [KEY_EMB_APP_INSTANCE_ID]: getAppInstanceId(pageSessionStorage, diagLogger),
    [ATTR_USER_AGENT_ORIGINAL]: window.navigator.userAgent,
    screen_resolution: `${window.screen.width}x${window.screen.height}`,
  });
};
