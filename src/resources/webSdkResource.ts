import { detectResourcesSync, Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { browserDetector } from '@opentelemetry/opentelemetry-browser-detector';
import { EMBRACE_SERVICE_NAME } from './constants.js';

export const getWebSDKResource = () => {
  let resource = new Resource({
    [ATTR_SERVICE_NAME]: EMBRACE_SERVICE_NAME,
    app_version: '0.0.1', // todo make this dynamic
    app_framework: 2, // todo remove
    bundle_id: 'test.bundle.js', // todo do we still need this?
    environment: 'development',
    sdk_version: '0.0.1', // todo make this dynamic
    sdk_simple_version: 1,
    os_type: 'android', // todo make this web
    os_version: '10.15.7', // todo make this dynamic, what to put?
    os_name: 'android', // todo make this web
    react_native_bundle_id: 'fd6996f1007b363f87a53be6d4a8a5fc', // todo make this dynamic
  });
  const detectedResources = detectResourcesSync({
    detectors: [browserDetector],
  });
  resource = resource.merge(detectedResources);
  return resource;
};
