import { sdk } from '@embrace-io/web-sdk';

const result = sdk.initSDK({
  appID: 'abc12',
  appVersion: 'YOUR_APP_VERSION',
});

if (!!result) {
  console.log('Successfully initialized the Embrace SDK');
} else {
  console.error('Failed to initialize the Embrace SDK');
}

console.log('Hello This is a Typescript project.');
