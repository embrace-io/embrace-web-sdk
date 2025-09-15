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

More documentation and examples can be found in our [Web Documentation](https://embrace.io/docs/web/getting-started/)

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
import { initSDK } from '@embrace-io/web-sdk';

const result = initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
});

if (!!result) {
  console.log("Successfully initialized the Embrace SDK");
} else {
  console.log("Failed to initialize the Embrace SDK");
}
```

At this point you should be able to rebuild your app and have Embrace begin collecting telemetry. Data should start to
show up in the Embrace Dashboard once the SDK reports at least 1 completed session. This can be triggered by launching
your app and then ending the session by either closing the tab/window or simply putting it in the background.

> [!NOTE]
> It may take a few minutes before the first sessions appear in your Embrace dashboard.

## Adding traces

In addition to what our auto-instrumentations provide you can create your own spans for operations you'd like to track.
For the most basic usage simply start a span and end it after some operation completes:

```typescript
import { trace } from '@embrace-io/web-sdk';

const span = trace.startSpan("span-name");

someAsyncOperation()
  .then(() => span.end())
  .catch(() => span.fail());
```

Only spans that are explicitly ended will be exported. Attributes and events can also be added to the span either on
start or later during its lifespan. Our API wraps that of an OpenTelemetry `Tracer` so you can follow
[these examples](https://opentelemetry.io/docs/languages/js/instrumentation/#create-spans) for more elaborate use-cases.

> [!NOTE]
> When exporting to Embrace span attribute values must be strings even though the OTel interface allows for a wider
> range of types

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
  attributes: {
    propertyA: 'valueA',
    propertyB: 'valueB'
  }
});
```

## Adding exceptions

The SDK automatically captures unhandled exceptions.

If there is a need to a log a handled exception, this can be done manually by calling the logException method:

```typescript
import { log } from '@embrace-io/web-sdk';

try {
  // some operation...
} catch (e) {
  log.logException(e as Error, {
    handled: true,
    attributes: {
      propertyA: 'valueA',
      propertyB: 'valueB'
    }
  });
}
```

## React Instrumentation

Instrumentation related to React is documented in [REACT.md](./REACT.md).

## Enriching with metadata

You can add custom properties to be included as part of the current session:

```typescript
import { session } from '@embrace-io/web-sdk';

session.addProperty("my-custom-property", "some value");
```

These properties will, by default, only be included in the current session.
If you want to add permanent properties that are sent across all sessions, you can configure the lifespan option:

```typescript
session.addProperty("my-custom-property", "some value", {
   lifespan: 'permanent',
});
```

## Keeping your app version up-to-date

Embrace uses the `appVersion` you provide to segment collected telemetry and allow you to view differences between
releases, as such you should make sure this value is updated whenever you release a new version of your application. If
you use your `package.json` to track versions of your app then a way to keep this up-to-date is simply to read that
value when initializing the SDK (assuming that your bundler provides a method for importing json files):

```typescript
import * as packageInfo from "../<some-path>/package.json";

initSDK({
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

Then hook the CLI into your build process and point it to your path where the built JS files live in order
to perform the upload:

```sh
npx embrace-web-cli upload -a "YOUR_EMBRACE_APP_ID" -t "YOUR_EMBRACE_UPLOAD_API_TOKEN" -p "JS_BUILD_PATH"
```

Additionally, if your app version is only known at build-time you can include it in the same command to have it injected
into the bundle. If you follow this method do not also include appVersion when calling `initSDK` as that value will take
precedence:

```sh
npx embrace-web-cli upload --app-version "APP_VERSION" -a "YOUR_EMBRACE_APP_ID" -t "YOUR_EMBRACE_UPLOAD_API_TOKEN" -p "JS_BUILD_PATH"
```

> [!NOTE]
> We currently support symbolication of function names only when defined with the function keyword.
> For functions assigned to constants, or variables, you will still see the unsymbolicated token.
> Line and column numbers, along with file names, will always be symbolicated to the original source.

## Configuring auto-instrumentations

The SDK provides several auto-instrumentations out-of-the box, in order to change how these behave (or disable certain
ones altogether) you can pass a `defaultInstrumentationConfig` object when initializing the SDK:

```typescript
import { initSDK } from '@embrace-io/web-sdk';

initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  defaultInstrumentationConfig: {
    omit: new Set(['@opentelemetry/instrumentation-fetch']),
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
import { initSDK } from '@embrace-io/web-sdk';

initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  instrumentations: [myCustomInstrumentation],
});
```

## Custom exporters

You can set up your own custom log and trace exporters and pass them in when initializing the SDK. The exporters should
be configured to point to an OTLP compatible endpoint and include any headers required for that endpoint, such as
authorization. Since these export requests will be made from a browser it is also required that the endpoint return
appropriate CORS headers in its responses:

```typescript
import { OTLPLogExporter }   from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  spanExporters: [
    new OTLPTraceExporter({
      url: 'https://example.com/endpoint/for/traces',
      headers: {
        'Authorization': 'Basic TOKEN'
      }
    }),
  ],
  logExporters: [
    new OTLPLogExporter({
      url: 'https://example.com/endpoint/for/logs',
      headers: {
        'Authorization': 'Basic TOKEN'
      }
    }),
  ],
  defaultInstrumentationConfig: {
    network: {
      ignoreUrls: ['https://example.com/endpoint/for/traces', 'https://example.com/endpoint/for/logs'],
    },
  },
});
```

> [!WARNING]
> Embrace automatically creates spans for network requests, however because the OTLP export itself makes a network
> request this can produce a cycle where the export's network request creates a span which is then exported which the
> creates another span, etc. 
> 
> To avoid this you can configure the network instrumentation to ignore the URLs to which you are exporting as shown in
> the above snippet.

## Including the SDK as a code snippet from CDN

We recommend you include our SDK as a regular npm dependency (see [Quick Start](#quick-start)). If you prefer to include
the SDK as a code snippet from CDN, you can do so by adding the following script tag to your generated HTML file:

```html
<script src="https://cdn.jsdelivr.net/npm/@embrace-io/web-sdk"></script>
```

Note: we recommend you pin specific versions to avoid breaking changes. Like:

```html
<script src="https://cdn.jsdelivr.net/npm/@embrace-io/web-sdk@X.X.X"></script>
```

Replacing `X.X.X` with the version of the SDK you wish to include. Check available version
on [npm](https://www.npmjs.com/package/@embrace-io/web-sdk).

We recommend you add this script tag to the `<head>` of your HTML file, so that it loads before your app code. This will
expose the SDK as a global variable `EmbraceWebSdk` on the `window` object. This needs to be added before any script
that makes use of the sdk.

The rest of this README assumes using the SDK from an NPM installation, here are some required changes to keep in mind
as you refer to that documentation:

1) Importing the sdk from node modules is no longer valid. Instead, reference it from the global `window` object:

   ```diff
   - import { sdk } from '@embrace-io/web-sdk';
   + const { sdk } = window.EmbraceWebSdk;
   ```

2) Our CLI tool does not support injecting an app version when loading from CDN since in that case our SDK is not
bundled with your code, instead you will need to make sure to pass in your app version when initializing the sdk as in
the following example:

   ```javascript
   initSDK({
     appVersion: '0.0.1',
     /*...*/
   });
   ```

### Async Loading

If you prefer to load the SDK asynchronously to avoid blocking the rendering of your page, you'll need to add the following snippet to your HTML file. Remember to replace `X.X.X` with the version of the SDK you want to include:
```html
<script>
   !function(){window.EmbraceWebSdkOnReady=window.EmbraceWebSdkOnReady||{q:[],onReady:function(e){window.EmbraceWebSdkOnReady.q.push(e)}};let e=document.createElement("script");e.async=!0,e.src="https://cdn.jsdelivr.net/npm/@embrace-io/web-sdk@X.X.X",e.onload=function(){window.EmbraceWebSdkOnReady.q.forEach(e=>e()),window.EmbraceWebSdkOnReady.q=[],window.EmbraceWebSdkOnReady.onReady=function(e){e()}};let n=document.getElementsByTagName("script")[0];n.parentNode.insertBefore(e,n)}();
</script>
```

By deferring the loading of the SDK, any early calls to the SDK need to be wrapped in the `onReady` method:

```javascript
window.EmbraceWebSdkOnReady.onReady(() => {
   window.EmbraceWebSdk.initSDK({
      appVersion: '0.0.1',
      /*...*/
   });
})
```

This is necessary to ensure that the SDK is fully loaded before you start using it.

> [!WARNING]
> The SDK may miss some early telemetry events emitted before the SDK is initialized if you use this method.

### Running multiple instances of the SDK

If you have multiple applications on the same page and want to run multiple instances of the SDK, you can do so by 
creating an instance of the SDK for each application. Make sure that the flag `registerGlobally` is set to `false` when
initializing the SDK. 

```typescript
import { initSDK } from '@embrace-io/web-sdk';

const embraceSDK = initSDK({
   appID: "YOUR_EMBRACE_APP_ID",
   appVersion: "YOUR_APP_VERSION",
   registerGlobally: false, // Prevents the SDK from registering itself globally
});
```

Since the SDK is not registered globally, you will need to use the `embraceSDK` instance to access the SDK methods 
and properties.

```typescript
import { initSDK } from '@embrace-io/web-sdk';

const embraceSDK = initSDK({
   appID: "YOUR_EMBRACE_APP_ID",
   appVersion: "YOUR_APP_VERSION",
   registerGlobally: false, // Prevents the SDK from registering itself globally
});

// Use this 
embraceSDK.log.message('This is a log message', 'info'); 

// Instead of
import { log } from '@embrace-io/web-sdk';

log.message('This is a log message', 'info');
```

Some instrumentation is still being registered globally and we're actively working on making it local for each instance:
* Fetch and XHR instrumentations are registered globally, so by default the last SDK to register will override the 
  previous instance's configuration and only the last instance will be able to capture network requests. If you don't 
  want the last instance to be the one that captures network request you can set `omitIfAlreadyPatched` to true when 
  configuring the network instrumentations to allow a different instance to control the capturing.
* Global error handler listens to all unhandled errors and rejections, all SDKs are going to report all the errors that 
  are not caught. 

## Network span forwarding

The SDK can be configured to inject a traceparent header on outgoing network requests. This header includes the
client-side trace ID associated with that particular network span. On the Embrace backend these network spans can then
be forwarded to other telemetry providers of your choice. This gives you the ability to view client-side spans alongside
server-side ones that form part of the same overall trace to provide an end-to-end representation. More details can be
found on the [Network Span Forwarding documentation page](https://embrace.io/docs/product/network-spans-forwarding/).

The enabling and configuration of this feature is done through our Embrace dashboard so nothing needs to be set in the
SDK to turn it on, however there are a few SDK-side configurations that could affect the feature to be aware of:

```typescript
import { sdk } from '@embrace-io/web-sdk';

sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  
  // Setting this to true blocks the Network Span Forwarding feature regardless of what has been configured server-side
  blockNetworkSpanForwarding: true,
  
  // Setting registerGlobally to false, providing a custom propagator, or omitting every network instrumentations are
  // all not supported alongside Network Span Forwarding and will cause that feature to turn off
  registerGlobally: false,
  propagator: myCustomPropagator,
  omit: new Set(['@opentelemetry/instrumentation-fetch', '@opentelemetry/instrumentation-xml-http-request']),
});
```

Also note that by default trace headers will not be included on outgoing CORS requests, this can be overridden for
particular URLs by configuring the fetch or XHR instrumentations with an allow list of strings and regexes:

```typescript
import { sdk } from '@embrace-io/web-sdk';

sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  defaultInstrumentationConfig: {
    '@opentelemetry/instrumentation-fetch': {
      propagateTraceHeaderCorsUrls: [
        // URL strings or regexes to propagate trace headers for on fetch requests
      ],
    },
    '@opentelemetry/instrumentation-xml-http-request': {
      propagateTraceHeaderCorsUrls: [
        // URL strings or regexes to propagate trace headers for on XHR requests
      ],
    },
  },
});
```

## Using without Embrace

If you'd prefer not to send data to Embrace you can simply omit the embrace app id when calling `initSDK`. Note that in
this case at least one custom exporter needs to be configured following the steps
from [Custom exporters](#custom-exporters) or else the SDK considers the configuration invalid.

## Browser Support

The SDK is intended to be imported as a module and transpiled by a bundler. We provide multiple builds of the SDK: ESNext and ES2022 module versions for use in modern build pipelines. OpenTelemetry set their current minumum language feature support to ES2022. Our default ESM SDK targets this as well to ensure compatibility. See more details in the [OpenTelemetry docs](https://github.com/open-telemetry/opentelemetry-js#browser-support).

We recommend importing the ESNext version of the SDK if your bundler supports it and letting your build pipeline handle the transpilation. This will ensure that the SDK you import is the smallest possible size.

We also provide a CDN version that is transpiled down to ES6/ES2015 for maximum compatibility with older browsers.

**Note:** we currently provide a CommonJS version of the SDK but it is not recommended for new projects and will be removed in a future release.

## Troubleshooting

### Upgrading between major versions

Please see our [Upgrade Guide](./UPGRADING.md) for specific steps.

### Compatibility with OTel packages

The SDK is built on top of OpenTelemetry and as such it is possible to use it alongside other OTel libraries. **Important:** The Embrace Web SDK only supports OpenTelemetry 1.x packages. OpenTelemetry 2.x (and above) is **not supported** and will not work with this SDK at this time.

If you wish to customize the SDK behavior by configuring custom resources, exporters, processors, or instrumentations, you must ensure that you are using versions of the OTel packages that are compatible with our SDK:

| Embrace Web SDK | Open Telemetry APIs | Core   | Instrumentations & Contrib |
|-----------------|---------------------|--------|----------------------------|
| ^2.0.0          | ^1.9.0              | ~2.0.3 | >=0.203.0 && <=0.299.0     |
| ^1.0.0          | ^1.9.0              | 1.30.1 | 0.57.2                     |

For a full list of dependencies used by the SDK, please refer to the [package.json](./package.json)
and [package-lock.json](./package-lock.json) files.

### Turning on verbose logging in the SDK

By default, the SDK will only send error level logs to the console. The log level of the SDK can be increased when
initializing as follows:

```typescript
import { initSDK, DiagLogLevel } from '@embrace-io/web-sdk';

initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  logLevel: DiagLogLevel.INFO,
});
```

In addition, initializing the SDK with `ConsoleLogRecordExporter` and `ConsoleSpanExporter` exporters allows you to take
a more detailed look at the spans and logs that are being exported from the SDK. These can be setup as custom exporters,
in which case their output will be batched, or wrapped in custom processors to see the telemetry outputted as it gets
emitted:

```typescript
import { initSDK, DiagLogLevel } from '@embrace-io/web-sdk';
import { ConsoleLogRecordExporter, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-web'

initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  logLevel: DiagLogLevel.INFO,

  // setup as exporters to output with the same batching as when exporting to a collector endpoint
  spanExporters: [new ConsoleSpanExporter()],
  logExporters: [new ConsoleLogRecordExporter()],

  // OR, wrap exporters with simple processors to output as soon as telemetry is emitted
  spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
  logProcessors: [new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())],
});
```

### Webpack 4 Configuration

When using webpack 4, you need to add an alias to your webpack configuration to resolve the OpenTelemetry semantic-conventions path correctly:

```javascript
// webpack.config.js
const path = require('node:path');

module.exports = {
  // ... other config
  resolve: {
    alias: {
      '@opentelemetry/semantic-conventions/incubating': path.resolve(
        __dirname,
        './node_modules/@opentelemetry/semantic-conventions/build/src/index-incubating.js'
      ),
    },
  },
};
```

See the [webpack 4 integration test](./tests/integration/platforms/webpack-4/webpack.config.js) for a complete example.

## FAQ

### How is data exported from the SDK

Refer to [DATA_EXPORT.md](./DATA_EXPORT.md) for details on how data is exported from the SDK.

### How is sensitive data protected

The SDK offers a few options to help protect sensitive data, refer to [these guidelines](https://embrace.io/docs/web/best-practices/security-considerations/)
for more information.

## Support

If you have a feature suggestion or have spotted something that doesn't look right please open
an [issue](https://github.com/embrace-io/embrace-web-sdk/issues/new) for the Embrace team to triage or reach out in
our [Community Slack](https://community.embrace.io/) for direct, faster assistance.

## Contributions

Please refer to our [contribution guide](./CONTRIBUTING.md) to get started.
