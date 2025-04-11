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
[![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-orange)](./LICENSE)
![GitHub top language](https://img.shields.io/github/languages/top/embrace-io/embrace-web-sdk)
![Build and tests status](https://github.com/embrace-io/embrace-web-sdk/actions/workflows/ci-nodejs.yml/badge.svg)

# Embrace Web SDK

## About

The Embrace Web SDK builds on top of [OpenTelemetry](https://opentelemetry.io) to capture performance data for web
applications, enabling full-stack observability of your system by connecting web and backend telemetry in a seamless
way.

Telemetry recorded through this SDK can be consumed on the Embrace platform for Embrace customers, but it can also be
used by those who are not Embrace customers to export collected data directly to any OTel Collector, either one that
they host or is hosted by other vendors. In effect, this SDK is an alternative to using the
[OpenTelemetry JS SDK](https://github.com/open-telemetry/opentelemetry-js) directly for web apps that want to leverage
the OpenTelemetry ecosystem for observability, but also want all the advanced telemetry capture that Embrace is known
for.

Currently, only Spans and Logs are supported, but other signals will be added in the future.

## Quick Start

### Install the package
npm:

```sh
npm install @embrace-io/web-sdk
```

yarn:

```sh
yarn add @embrace-io/web-sdk
```

> [!TIP]
> For CDN installs, see [Including the SDK as a code snippet from CDN](#including-the-sdk-as-a-code-snippet-from-cdn).

### Initialize the SDK
First sign up for an Embrace account by going to https://dash.embrace.io/signup (see
[Using without Embrace](#using-without-embrace) if you wish to skip this step).

Once you've created an Embrace web application you can initialize the SDK using the appID you were given along with
the app version of your application. The following should be done as early in your app's lifecycle as possible to start
capturing telemetry:

```typescript
import { sdk } from '@embrace-io/web-sdk';

const result = sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
});

if (!result) {
  console.log("Failed to initialize Embrace SDK");
}
```

At this point you should be able to rebuild your app and have Embrace begin collecting telemetry. Data should start to
show up in the Embrace Dashboard once the SDK reports at least 1 completed session. This can be triggered by launching
your app and then ending the session by either closing the tab/window or simply putting it in the background.

> [!NOTE] It may take a few minutes before the first Sessions appear in your Embrace dashboard.

## Adding traces

In addition to what our auto-instrumentations provide you can create your own spans for operations you'd like to track.
For the most basic usage simply start a span and end it after some operation completes:

```typescript
import { trace } from '@embrace-io/web-sdk';

const span = trace.startSpan("span-name");

someAsyncOperation().then(() => span.end());
```

Attributes and events can also be added to the span either on start or later during its lifespan. Our API wraps that of
an OpenTelemetry `Tracer` so you can
follow [these examples](https://opentelemetry.io/docs/languages/js/instrumentation/#create-spans) for more elaborate
use-cases.

## Adding logs

You can add basic context to sessions by emitting a breadcrumb that will be visible in the timeline for that session:

```typescript
import { session } from '@embrace-io/web-sdk';

session.addBreadcrumb("something happened");
```

A full log message can also be emitted. Note that unlike emitting a breadcrumb a log is more heavy-weight and may
trigger a network request to export the data:

```typescript
import { log } from '@embrace-io/web-sdk';

log.message('Loading not finished in time.', 'error', {
  propertyA: 'valueA',
  propertyB: 'valueB'
});
```

## Enriching with metadata

You can add custom properties to be included as part of the current session:

```typescript
import { session } from '@embrace-io/web-sdk';

session.addProperty("my-custom-property", "some value");
```

## Keeping your app version up-to-date

Embrace uses the `appVersion` you provide to segment collected telemetry and allow you to view differences between
releases, as such you should make sure this value is updated whenever you release a new version of your application. If
you use your `package.json` to track versions of your app then a way to keep this up-to-date is simply to read that
value when initializing the SDK (assuming that your bundler provides a method for importing json files):

```typescript
import * as packageInfo from "../<some-path>/package.json";

sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: packageInfo.version,
});
```

Alternatively if your app version is generated as part of your CI/CD process, you can use our CLI tool to inject your
app version into your bundle at build time. The process is part of [Uploading sourcemaps](#upload-sourcemaps) described
below.

## Upload sourcemaps

In order to view symbolicated stack traces for exceptions in Embrace you must first upload your bundle and sourcemap
files. You can do so using our CLI tool, if you haven't already you can install it using:

npm:

```sh
npm install --save-dev @embrace-io/web-cli
```

yarn:

```sh
yarn add -D @embrace-io/web-cli
```

You will also require a `Symbol Upload` API token. This can be found in your Embrace dashboard by going
to [Settings->API](https://dash.embrace.io/settings/organization/api).

Then hook the CLI into your build process and point it to your built bundle and sourcemaps in order to perform the
upload:

```sh
npx embrace-web-cli upload -a "YOUR_EMBRACE_APP_ID" -t "YOUR_EMBRACE_UPLOAD_API_TOKEN" -b "BUNDLE_PATH" -m "SOURCE_MAP_PATH"
```

Additionally, if your app version is only known at build-time you can include it in the same command to have it injected
into the bundle. If you follow this method do not also include appVersion when calling `initSDK` as that value will take
precedence:

```sh
npx embrace-web-cli upload --app-version "APP_VERSION" -a "YOUR_EMBRACE_APP_ID" -t "YOUR_EMBRACE_UPLOAD_API_TOKEN" -b "BUNDLE_PATH" -m "SOURCE_MAP_PATH"
```

> [!NOTE]
> We currently support symbolication of function names only when defined with the function keyword. 
> For functions assigned to constants, or variables, you will still see the unsymbolicated token.
> Line and column numbers, along with file names, will always be symbolicated to the original source.

## Configuring auto-instrumentations

The SDK provides several auto-instrumentations out-of-the box, in order to change how these behave (or disable certain
ones altogether) you can pass a `defaultInstrumentationConfig` object when initializing the SDK:

```typescript
import { sdk } from '@embrace-io/web-sdk';

sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  defaultInstrumentationConfig: {
    omit: new Set(['@opentelemetry-instrumentation-fetch']),
    'web-vitals': {
      trackingLevel: 'all'
    }
  },
});
```

View the type definition for `defaultInstrumentationConfig` to see the full set of configuration options.

For more advanced customization you can also include additional instrumentations as long as they conform to the
`Instrumentation` interface:

```typescript
import { sdk } from '@embrace-io/web-sdk';

sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  instrumentations: [myCustomInstrumentation],
});
```

## Custom exporters

If you wish to export your data to another backend in addition to Embrace you can set up your own custom log and trace
exporters and pass them in when initializing the SDK. For example to send telemetry to Grafana cloud using OTLP you
could do the following:

```typescript
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  spanExporters: [
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

## Including the SDK as a code snippet from CDN

We recommend you include our SDK as a regular npm dependency (see [Quick Start](#quick-start)). If you prefer to include
the SDK as a code snippet from CDN, you can do so by adding the following script tag to your generated HTML file:

```html

<script src="https://cdn.jsdelivr.net/npm/@embrace-io/web-sdk"></script>
```

Note: we recommend you pin specific versions to avoid breaking changes. For example:

```html

<script src="https://cdn.jsdelivr.net/npm/@embrace-io/web-sdk@0.0.12"></script>
```

We recommend you add this script tag to the `<head>` of your HTML file, so that it loads before your app code. This will
expose the SDK as a global variable `EmbraceWebSdk` on the `window` object. This needs to be added before any script
that makes use of the sdk.

The rest of this README assumes using the SDK from an NPM installation, here are some required changes to keep in mind
as you refer to that documentation:

1) Importing the sdk from node modules is no longer valid. Instead, reference it from the global `window` object:

```diff
- import { sdk } from '@embrace-io/web-sdk';
+ const sdk = window.EmbraceWebSdk;
```

2) Because our web-cli does not support the CDN version of the SDK, you will need to make sure to pass in your app
   version when initializing the sdk. If you don't, then your app version will be reported to Embrace as
   `EmbIOAppVersionX.X.X`

```javascript
  sdk.initSDK({
  appVersion: '0.0.1',
  /*...*/
});
```

3) Because our web-cli does not support the CDN version of the SDK, the sourcemaps upload won't work
   (see [Upload sourcemaps](#upload-sourcemaps)). You will not see symbolicated stack traces in Embrace.

## Using without Embrace

If you'd prefer not to send data to Embrace you can simply omit the embrace app id when calling `initSDK`. Note that in
this case at least one custom exporter needs to be configured following the steps
from [Custom exporters](#custom-exporters) or else the SDK considers the configuration invalid.

## Troubleshooting

### Turning on verbose logging in the SDK

By default, the SDK will only send error level logs to the console. The log level of the SDK can be increased when
initializing as follows:

```typescript
import { sdk } from '@embrace-io/web-sdk';

...

sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  logLevel: sdk.DiagLogLevel.INFO,
});
```

## Support

If you have a feature suggestion or have spotted something that doesn't look right please open
an [issue](https://github.com/embrace-io/embrace-web-sdk/issues/new) for the Embrace team to triage or reach out in
our [Community Slack](https://community.embrace.io/) for direct, faster assistance.

## Contributions

Please refer to our [contribution guide](./CONTRIBUTING.md) to get started.