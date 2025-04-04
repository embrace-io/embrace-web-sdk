<p align="center">
  <a href="https://embrace.io/?utm_source=github&utm_medium=logo" target="_blank">
    <picture>
      <source srcset="https://embrace.io/docs/images/embrace_logo_white-text_transparent-bg_400x200.svg" media="(prefers-color-scheme: dark)" />
      <source srcset="https://embrace.io/docs/images/embrace_logo_black-text_transparent-bg_400x200.svg" media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)" />
      <img src="https://embrace.io/docs/images/embrace_logo_black-text_transparent-bg_400x200.svg" alt="Embrace">
    </picture>
  </a>
</p>

[![codecov](https://codecov.io/gh/embrace-io/embrace-web-sdk/graph/badge.svg?token=88948NPGPI)](https://codecov.io/gh/embrace-io/embrace-web-sdk)
![GitHub Release Date](https://img.shields.io/github/release-date/embrace-io/embrace-web-sdk)
![GitHub commit activity](https://img.shields.io/github/commit-activity/t/embrace-io/embrace-web-sdk)
[![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-orange)](./LICENSE.txt)
![GitHub top language](https://img.shields.io/github/languages/top/embrace-io/embrace-web-sdk)
![Build and tests status](https://github.com/embrace-io/embrace-web-sdk/actions/workflows/ci-nodejs.yml/badge.svg)

# Embrace Web SDK

## Quick Start

npm:

```sh
npm install @embrace-io/web-sdk
```

yarn:

```sh
yarn add @embrace-io/web-sdk
```

Sign up for an Embrace account by going to https://dash.embrace.io/signup (See [Using without Embrace](#using-without-embrace)
if you wish to skip this step).

Once you've created an Embrace web application you can initialize the SDK using the appID you were given along with
the app version of your application:

```typescript
import { sdk } from '@embrace-io/web-sdk';

...

sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
});
```

At this point you should be able to rebuild your app and have Embrace begin collecting telemetry. Data should start to
show up in the Embrace Dashboard once the SDK reports at least 1 completed user session. This can be triggered by launching
your app and then ending the session by either closing the tab/window or simply putting it in the background.

## Keeping your app version up-to-date

Embrace uses the `appVersion` you provide to segment collected telemetry and allow you to view differences between
releases, as such you should make sure this value is updated whenever you release a new version of your application. If
you use your `package.json` to track versions of your app then a way to keep this up-to-date is simply to read that
value when initializing the SDK:

```typescript
import * as packageInfo from "../<some-path>/package.json";

...

sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: packageInfo.version,
});
```

Otherwise you can use our CLI tool to inject your app version into your bundle at build time as part of your CI/CD.
First install the CLI as a devDependency:

npm:

```sh
npm install --save-dev @embrace-io/web-cli
```

yarn:

```sh
yarn add -D @embrace-io/web-cli
```

Then hook it into your CI/CD:

```sh
TODO
```

## Configuring auto-instrumentations

The SDK provides several auto-instrumentations out-of-the box, in order to change how these behave (or disable certain
ones altogether) you can override the default set of instrumentations using a configuration object when initializing the
SDK:

```typescript
import { sdk } from '@embrace-io/web-sdk';

...

sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  instrumentations: sdk.getDefaultInstrumentations({
    '@opentelemetry-instrumentation-fetch': {
      enabled: false,
    },
    'web-vitals': {
      trackingLevel: 'all'
    }
  }),
});
```

View the `TODO` type definition for the full set of configuration options. Note that `getDefaultInstrumentations` returns
a list, for more advanced customization you can append your own instrumentations to the list provided that they confirm
to the `Instrumentation` interface.

## Upload sourcemaps

In order to view symbolicated stack traces for exceptions in Embrace you must first upload your bundle and sourcemap files.
You can do so using our CLI tool, if you haven't already you can install it using:

```sh
npm install --save-dev @embrace-io/web-cli
```

yarn:

```sh
yarn add -D @embrace-io/web-cli
```

You will also require an upload API token. This can be found in your Embrace dashboard by going to [Settings->API](https://dash.embrace.io/settings/organization/api).

Then hook the CLI into your CI/CD and point it to your bundle and sourcmaps in order to perform the upload:

```sh
TODO
```

## Adding traces

In addition to what our auto-instrumentations provide you can create your own spans for operations you'd like to track.
For the most basic usage simply start a span and end it after some operation completes:

```typescript
import { trace } from '@embrace-io/web-sdk';

const span = trace.startSpan("span-name");

someAsyncOperation().then(() => span.end());
```

## Adding logs

You can add basic context to sessions by emitting a breadcrumb that will be visible in the timeline for that session:

```typescript
import { session } from '@embrace-io/web-sdk';

session.addBreadcrumb("something happened");
```

A full log message can also be emitted. Note that unlike emitting a breadcrumb a log may trigger a network request to
export the data:

```typescript
import { log } from '@embrace-io/web-sdk';

log.message('Loading not finished in time.', 'error', {
  propertyA: 'valueA',
  propertyB: 'valueB'
});
```

## Enriching with metadata

You can add custom properties to be included as part of the current session

```typescript
import { session } from '@embrace-io/web-sdk';

session.addProperty("my-custom-property", "some value");
```

If you have your own identifier for the current user you can annotate the session wit this ID. Note that this data will
be uploaded to Embrace, so think about the privacy of your users and only include data you are willing to share. We
recommend using an anonymized or hashed user ID that only your agents can search for:

```typescript
import { user } from '@embrace-io/web-sdk';

user.setIdentifier("internal_id_1234");
```

## Custom exporters

If you wish to export your data to another backend in addition to Embrace you can setup your own custom log and trace
exporters and pass them in when initializing the SDK. For example to send telemetry to Grafana cloud using OTLP you could
do the following:

```typescript
sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  traceExporters: [
    new OTLPTraceExporter({
      url: `GRANAFA_ENDPOINT/v1/traces`,
      headers: {
        'Authorization': 'Basic YOUR_GRAFANA_CLOUD_TOKEN'
      }
    }),
  ],
  logExporters: [
    new OTLPLogExporter({
      url: `GRANAFA_ENDPOINT/v1/logs`,
      headers: {
        'Authorization': 'Basic YOUR_GRAFANA_CLOUD_TOKEN'
      }
    }),
  ]
});
```

## Using without Embrace

If you'd prefer not to send data to Embrace you can simply omit the embrace app id when calling `initSDK`. Note that in
this case at least one custom exporter needs to be configured following the steps from [Custom exporters](#custom-exporters)
or else the SDK considers the configuration invalid.

## Including the SDK as a code snippet from CDN

TODO

## Troubleshooting

### Version differences in opentelemetry dependencies

TODO

## Support

If you have a feature suggestion or have spotted something that doesn't look right please open an [issue](https://github.com/embrace-io/embrace-react-native-sdk/issues/new) for the
Embrace team to triage or reach out in our [Community Slack](https://community.embrace.io/) for direct, faster assistance.

## Contributions

Please refer to our [contribution guide](./CONTRIBUTING.md) to get started.