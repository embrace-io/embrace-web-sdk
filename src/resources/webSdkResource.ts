import { detectResourcesSync, Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { browserDetector } from '@opentelemetry/opentelemetry-browser-detector';
import { TEMPLATE_BUNDLE_ID } from './constants/index.js';

export const getWebSDKResource = () => {
  let resource = new Resource({
    [ATTR_SERVICE_NAME]: 'embrace-web-sdk',
    app_version: '0.0.1',
    app_framework: 2,
    bundle_id: 'test.bundle.js',
    environment: 'development',
    sdk_version: '0.0.1',
    sdk_simple_version: 1,
    os_type: 'android',
    os_version: '10.15.7',
    os_name: 'android',
    react_native_bundle_id: TEMPLATE_BUNDLE_ID,
  });
  const detectedResources = detectResourcesSync({
    detectors: [browserDetector],
  });
  resource = resource.merge(detectedResources);
  return resource;
};
