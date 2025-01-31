import {detectResourcesSync, Resource} from '@opentelemetry/resources';
import {ATTR_SERVICE_NAME} from '@opentelemetry/semantic-conventions';
import {browserDetector} from '@opentelemetry/opentelemetry-browser-detector';

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
    react_native_bundle_id: 'fd6996f1007b363f87a53be6d4a8a5fc',
  });
  const detectedResources = detectResourcesSync({detectors: [browserDetector]});
  resource = resource.merge(detectedResources);
  return resource;
};
