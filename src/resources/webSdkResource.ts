import { browserDetector } from '@opentelemetry/opentelemetry-browser-detector';
import { detectResourcesSync, Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
  EMBRACE_SERVICE_NAME,
  NATIVE_FRAMEWORK,
  SDK_VERSION,
  TEMPLATE_APP_VERSION,
  TEMPLATE_BUNDLE_ID,
} from './constants/index.js';

export const getWebSDKResource = (appVersion?: string) => {
  /* We need to trim the app  version to remove any leading/trailing spaces
  added by our cli tool. This is required to guarantee that the version is always
  20 characters long in the final bundle, so sourcemaps don't get confused by
  changing the length of the inlined app version. E.g. versions "0.0.1" and "0.0.115"
  are both valid, but injecting them without leading whitespaces will result in
  different lengths, pushing the sourcemaps mapping out of range. Instead,
  "               0.0.1" and "             0.0.115" are both 20 characters long,
  and we trim them before loading at runtime

  if the app version has been passed as an argument, we use it instead of the
  one processed by our cli tool. This will allow for no cli installations,
  like importing the web sdk from a CDN
  */
  const processedAppVersion = appVersion ?? TEMPLATE_APP_VERSION.trim();

  let resource = new Resource({
    [ATTR_SERVICE_NAME]: EMBRACE_SERVICE_NAME,
    [ATTR_TELEMETRY_SDK_NAME]: EMBRACE_SERVICE_NAME,
    app_version: processedAppVersion,
    app_framework: NATIVE_FRAMEWORK,
    bundle_id: TEMPLATE_BUNDLE_ID,
    sdk_version: SDK_VERSION,
    [ATTR_TELEMETRY_SDK_VERSION]: SDK_VERSION,
    sdk_simple_version: 1,
    sdk_platform: 'web',
    [ATTR_TELEMETRY_SDK_LANGUAGE]: 'webjs',
  });
  const detectedResources = detectResourcesSync({
    detectors: [browserDetector],
  });
  resource = resource.merge(detectedResources);
  return resource;
};
