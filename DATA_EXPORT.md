# SDK Data Export

## When is data sent?

Telemetry data for Spans and Logs are exported from the SDK independently. Spans are sent as a batch whenever a session
ends, this is managed by the [EmbraceSessionBatchedSpanProcessor](./src/processors/EmbraceSessionBatchedSpanProcessor/EmbraceSessionBatchedSpanProcessor.ts).
Logs are also batched but can be sent throughout a session, this is managed by a [BatchLogRecordProcessor](https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.57.0/experimental/packages/sdk-logs/src/platform/browser/export/BatchLogRecordProcessor.ts).

## How is data sent?

Data from the SDK is sent to Embrace using a CORS HTTP POST request. The data is gzip compressed and encoded as
[OTLP JSON Protobuf](https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding). We make use of the
[keepalive property](https://developer.mozilla.org/en-US/docs/Web/API/Request/keepalive) of the browser's Fetch API to
help ensure the transmission of data even if the page has been closed. If possible we will attempt to retry request
failures following an exponential backoff. See [FetchTransport](./src/transport/FetchTransport/FetchTransport.ts) and
[RetryingTransport](src/transport/RetryingTransport/RetryingTransport.ts) for more details. 

> [!NOTE]
> The Fetch API's `keepalive` property is supported by all modern browsers, however it was a relatively recent addition
> to Firefox and may not exist on some older versions of that browser in particular. Refer to this [Browser compatibility chart](https://developer.mozilla.org/en-US/docs/Web/API/Request/keepalive#browser_compatibility)
> for more details.

## What happens with custom export?

If you [provide your own custom exporter](./README.md#custom-exporters) then batching of spans and logs are managed by a
[BatchLogRecordProcessor](https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.57.0/experimental/packages/sdk-logs/src/platform/browser/export/BatchLogRecordProcessor.ts)
and [BatchSpanProcessor](https://github.com/open-telemetry/opentelemetry-js/blob/v1.30.0/packages/opentelemetry-sdk-trace-base/src/platform/browser/export/BatchSpanProcessor.ts)
respectively.

