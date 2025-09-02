# Upgrading

## 1.x to 2.x

See the breaking changes outlined in the [2.0.0 Release notes](https://github.com/embrace-io/embrace-web-sdk/releases/tag/2.0.0).

If your app has direct dependencies on OTel JS packages ensure they are updated to the 2.x versions, see
[the compatibility table](./README.md#compatibility-with-otel-packages) for more info.

### Moved exports from under `sdk` to the top-level

1.x version:

```typescript
import { sdk } from '@embrace-io/web-sdk';

sdk.initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  logLevel: sdk.DiagLogLevel.INFO,
});

const myMethod = (span: sdk.Span) => { /* ... */ };
```

2.x version:

```typescript
import { initSDK, DiagLogLevel, Span } from '@embrace-io/web-sdk';

initSDK({
  appID: "YOUR_EMBRACE_APP_ID",
  appVersion: "YOUR_APP_VERSION",
  logLevel: DiagLogLevel.INFO,
});

const myMethod = (span: Span) => { /* ... */ };
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
* Update Embrace trace API calls from `startPerformanceSpan` to `startSpan`
* Update any optional arguments being passed to `log.message` or `log.logException`

### Update start span calls

0.x version:

```typescript
import { trace } from '@embrace-io/web-sdk';

const span = trace.startPerformanceSpan("span-name");
```

1.x version:

```typescript
import { trace } from '@embrace-io/web-sdk';

const span = trace.startSpan("span-name");
```

### Update logging arguments

0.x version:

```typescript
import { log } from '@embrace-io/web-sdk';

log.message('Loading not finished in time.', 'error', {
  keyA: 'valueA',
  keYB: 'valueB'
}, true);

// ... 

log.logException(err, true, { keyA: 'valueA' }, ts);
```

1.x version:

```typescript
import { log } from '@embrace-io/web-sdk';

log.message('Loading not finished in time.', 'error', {
  attributes: {
    keyA: 'valueA',
    keYB: 'valueB'
  },
  includeStacktrace: true
});

// ... 

log.logException(err, {
  handled: true,
  attributes: { keyA: 'valueA' },
  timestamp: ts,
});
```