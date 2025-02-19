import { detectResourcesSync, Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { browserDetector } from '@opentelemetry/opentelemetry-browser-detector';
import {
  EMBRACE_SERVICE_NAME,
  NATIVE_FRAMEWORK,
  TEMPLATE_BUNDLE_ID,
} from './constants/index.js';

export const getWebSDKResource = () => {
  let resource = new Resource({
    [ATTR_SERVICE_NAME]: EMBRACE_SERVICE_NAME,
    app_version: '0.0.1', // TODO: this should be provided by the user / injected by our cli / both
    app_framework: NATIVE_FRAMEWORK,
    bundle_id: TEMPLATE_BUNDLE_ID,
    sdk_version: '0.0.1', // TODO: this should be injected by our cli
    sdk_simple_version: 1,
    sdk_platform: 'web',
  });
  const detectedResources = detectResourcesSync({
    detectors: [browserDetector],
  });
  resource = resource.merge(detectedResources);
  return resource;
};
