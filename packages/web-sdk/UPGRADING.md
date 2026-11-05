# Upgrading

## 2.x to 3.0

### ESM only

CommonJS is not supported. The package is ESM only: `require('@embrace-io/web-sdk')` fails with `ERR_REQUIRE_ESM` on Node versions that cannot load ES modules, and any case where it loads is unsupported. Load the SDK with `import` or a bundler; from a CommonJS file, use dynamic `import()`. TypeScript projects need `moduleResolution` set to `bundler`, `node16` or `nodenext` to resolve the package's types.

### CDN bundle targets ES2022

The CDN bundle (`embrace-web-sdk.js`) is built for ES2022 instead of ES6. Sending to Embrace needs at least Chrome and Edge 85, Firefox 113, Safari 16.4 and Samsung Internet 14.

### OpenTelemetry JS 3.0

The SDK depends on OpenTelemetry JS 3.0 (`@opentelemetry/api` 1.10, the 3.x SDK packages and the 0.300 experimental packages). See the [OpenTelemetry JS 3.x migration guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/3.x/migration-guide.md) for the full list of upstream changes.

- `@opentelemetry/api-logs` is removed. Import `logs`, `SeverityNumber` and the other Logs API types from `@opentelemetry/api`. A `logs.getLogger()` call made through `@opentelemetry/api-logs` gets a no-op logger, so its logs do not reach Embrace.
- Objects that you pass to `initSDK`, such as span and log processors, exporters and resources, must come from the 3.x SDK packages (`@opentelemetry/sdk-trace`, `@opentelemetry/sdk-logs` and `@opentelemetry/resources`). `@opentelemetry/sdk-logs` removes two type aliases: use `ReadWriteLogRecord` instead of `SdkLogRecord`, and `LoggerProviderOptions` instead of `LoggerProviderConfig`.
- If your app also loads OpenTelemetry JS 2.x (`@opentelemetry/api` 1.9), both API copies share one global object. The copy that registers something first (a `diag` logger, tracer provider, logger provider, propagator or context manager) owns it, and every registration from the other copy fails. `initSDK` registers its `diag` logger before its providers, so when the 2.x copy registers first, the SDK's providers are not global and the global `diag` drops the SDK's messages. Upgrade the other OpenTelemetry packages in the app to 3.x. When the SDK cannot register its global `TracerProvider` or `LoggerProvider` for another reason, such as a provider that is already registered, it logs a warning through `diag`.
- `@opentelemetry/api` 1.10 makes `AttributeValue` an alias of `AnyValue`, which is `unknown`. The `attributes` option of `log.message()` and `log.logException()` now accepts objects, mixed-type arrays, `Uint8Array` and `null` without a type error. The SDK converts every value of this option to a string with `toString()`: an object becomes `'[object Object]'`, an array or `Uint8Array` becomes its elements separated by commas, and `null` becomes an empty string.
- Span attributes keep object, mixed-type array, `Uint8Array` and `null` values and export them as nested OTLP values. With 2.x, the span dropped these values. Log records that you emit through `logs.getLogger()` kept them with 2.x too. Span event attributes still accept only strings, numbers, booleans and arrays of one of these types.
- A log attribute whose value is `undefined` is dropped. With 2.x, the log record kept it and the SDK exported it with an empty value, for example `app.surface.name` on the web vital logs of a page without a route.
- A span event keeps at most 20 attributes and drops the rest. OpenTelemetry JS 2.x did not enforce a limit on span event attributes.
- Attribute scrubbing, both the default scrubbers and your `attributeScrubbers`, only changes an attribute whose value is a string. The SDK does not scrub an object or array value, or the strings inside it.
- The spans of `@opentelemetry/instrumentation-fetch` and `@opentelemetry/instrumentation-xml-http-request` have the instrumentation scope version `0.300.0` instead of `0.223.0`. Update queries and filters that match on this version.
- Installs need Node.js 22.15 or later. On earlier versions, npm reports `EBADENGINE`, and installs fail when `engine-strict` is set.
- The OpenTelemetry packages select their browser code with `#platform` subpath imports, so your bundler must support the `imports` and `exports` fields of `package.json`. This needs webpack 5.54 or later, Jest 29.4 or later, and Metro 0.81.3 or later. Parcel needs [package exports enabled](https://parceljs.org/features/dependency-resolution/#enabling-package-exports).

### Instrumentations follow the OpenTelemetry browser lifecycle

The `instrumentations` option of `initSDK` uses the `Instrumentation` interface from OpenTelemetry Browser instead of the one from `@opentelemetry/instrumentation`:

- Build a custom instrumentation on `InstrumentationBase` from [opentelemetry-browser](https://github.com/open-telemetry/opentelemetry-browser), or implement its `Instrumentation` interface (`instrumentationName`, `enable(deps)`, `disable()` and `isEnabled()`). `initSDK` calls `enable()` on each one with its tracer provider, logger provider and propagator.
- `initSDK` skips an instrumentation built on `@opentelemetry/instrumentation` and logs an error.
- Under `registerGlobally: false`, the document load span continues the trace of a `<meta name="traceparent">` tag through the `propagator` option, or through the SDK's W3C trace context propagator when Network Span Forwarding is on. With 2.x it used the global propagator.
- When the `rootNode` of `defaultInstrumentationConfig['empty-root']` is null, the SDK logs an error through `diag` instead of a warning.

### Removed `defaultInstrumentationConfig` fields

- `diag` is removed from every entry that configures an Embrace instrumentation, such as `document-load` and `web-vital`. Instrumentations log through the global `diag` channel, so set the verbosity with the `logLevel` option of `initSDK`.

### Removed HTTP response size attributes

The document fetch and resource fetch spans no longer set `http.response_content_length` and `http.response_content_length_uncompressed`. Read `http.response.body.size` and `http.response.decoded_body_size` instead, which carry the same values.

### Removed session methods

The deprecated `session` methods from 2.21.0 are removed. Methods with a replacement:

| Removed                          | Replacement                          |
| -------------------------------- | ------------------------------------ |
| `session.getSessionId()`         | `session.getUserSessionId()`         |
| `session.getSessionStartTime()`  | `session.getUserSessionStartTime()`  |
| `session.endSessionSpan()`       | `session.endUserSession()`           |
| `session.getSessionSpan()`       | `session.getSessionPartSpan()`       |
| `session.getPreviousSessionId()` | `session.getPreviousUserSessionId()` |

`session.startSessionSpan()`, `session.currentSessionAsReadableSpan()`, `session.addSessionStartedListener()` and
`session.addSessionEndedListener()` did nothing in 2.x and have no replacement.

## 2.x to 2.21.0

The session API now distinguishes between a **user session** (the full period of user engagement, which can span
multiple foregrounds of the page) and a **session part** (a single foreground period within a user session). Methods
on `session` were renamed to make this explicit. The old names still work as deprecated forwarders and will be
removed in a future version.

### Renamed methods

| Deprecated                      | Replacement                         |
| ------------------------------- | ----------------------------------- |
| `session.getSessionId()`        | `session.getUserSessionId()`        |
| `session.getSessionStartTime()` | `session.getUserSessionStartTime()` |
| `session.endSessionSpan()`      | `session.endUserSession()`          |
| `session.getSessionSpan()`      | `session.getSessionPartSpan()`      |

For example:

```typescript
import { session } from '@embrace-io/web-sdk';

// Before
session.endSessionSpan();

// After
session.endUserSession();
```

A new user session begins with the next session part: immediately if the tab is still foregrounded, otherwise
the next time it is foregrounded. The call is subject to a 5-second cooldown.

`getSessionPartSpan()` is provided for backwards compatibility only: direct access to the span will be removed
entirely in a future version. The SDK owns the span's lifecycle and can end it at any moment, so do not end it
yourself or hold long-lived references to it.

### Deprecated methods with changed behavior

- `session.getPreviousSessionId()` always returns `null`. Use `session.getPreviousUserSessionId()` instead.
- `session.startSessionSpan()` is a no-op. A session part starts automatically when the page is foregrounded, this
  is no longer exposed as an API.
- `session.currentSessionAsReadableSpan()` always returns `null`.
- `session.addSessionStartedListener()` and `session.addSessionEndedListener()` are no-ops, the listeners are never
  invoked and the returned unsubscribe functions do nothing.

## 1.x to 2.x

See the breaking changes outlined in the [2.0.0 Release notes](https://github.com/embrace-io/embrace-web-sdk/releases/tag/2.0.0).

If your app has direct dependencies on OTel JS packages ensure they are updated to the 2.x versions, see
[the compatibility table](./README.md#compatibility-with-otel-packages) for more info.

### Moved exports from under `sdk` to the top-level

1.x version:

```typescript
import { sdk } from '@embrace-io/web-sdk';

sdk.initSDK({
  appID: 'YOUR_EMBRACE_APP_ID',
  appVersion: 'YOUR_APP_VERSION',
  logLevel: sdk.DiagLogLevel.INFO,
});

const myMethod = (span: sdk.Span) => {
  /* ... */
};
```

2.x version:

```typescript
import { initSDK, DiagLogLevel, Span } from '@embrace-io/web-sdk';

initSDK({
  appID: 'YOUR_EMBRACE_APP_ID',
  appVersion: 'YOUR_APP_VERSION',
  logLevel: DiagLogLevel.INFO,
});

const myMethod = (span: Span) => {
  /* ... */
};
```

### CLI now operates on a build folder rather than individual files

1.x version:

```shell
npx embrace-web-cli upload --app-version "APP_VERSION" -a "YOUR_EMBRACE_APP_ID" -t "YOUR_EMBRACE_UPLOAD_API_TOKEN" -b "BUNDLE_PATH" -m "SOURCE_MAP_PATH"
```

2.x version:

```shell
npx embrace-web-cli upload --app-version "APP_VERSION" -a "YOUR_EMBRACE_APP_ID" -t "YOUR_EMBRACE_UPLOAD_API_TOKEN" -p "JS_BUILD_PATH"
```

## 0.x to 1.x

See the breaking changes outlined in the [1.0.0 Release notes](https://github.com/embrace-io/embrace-web-sdk/releases/tag/1.0.0).

In order to upgrade you will need to:
- Update Embrace trace API calls from `startPerformanceSpan` to `startSpan`
- Update any optional arguments being passed to `log.message` or `log.logException`

### Update start span calls

0.x version:

```typescript
import { trace } from '@embrace-io/web-sdk';

const span = trace.startPerformanceSpan('span-name');
```

1.x version:

```typescript
import { trace } from '@embrace-io/web-sdk';

const span = trace.startSpan('span-name');
```

### Update logging arguments

0.x version:

```typescript
import { log } from '@embrace-io/web-sdk';

log.message(
  'Loading not finished in time.',
  'error',
  {
    keyA: 'valueA',
    keYB: 'valueB',
  },
  true,
);

// ...

log.logException(err, true, { keyA: 'valueA' }, ts);
```

1.x version:

```typescript
import { log } from '@embrace-io/web-sdk';

log.message('Loading not finished in time.', 'error', {
  attributes: {
    keyA: 'valueA',
    keYB: 'valueB',
  },
  includeStacktrace: true,
});

// ...

log.logException(err, {
  handled: true,
  attributes: { keyA: 'valueA' },
  timestamp: ts,
});
```
