import {Resource} from '@opentelemetry/resources';
import {ATTR_SERVICE_NAME} from '@opentelemetry/semantic-conventions';

const getWebSDKResource = () => {
  return new Resource({
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
  });
};

export {getWebSDKResource};
