# Local debugging collector

This is a simple collector for local debugging and testing purposes. It listens on port 3001 for OTLP HTTP requests and logs the received data to the console.
It runs automatically when you run `npm run dev` in the root of the repository.

## Usage

To start the server, run:

```bash
npm run dev
```

And update your .env file to point to the local collector:

```
# demo/frontend/.env

VITE_DATA_URL=http://localhost:3001
```

## Endpoints

The collector serves two ingest route families: Embrace ingest (`embrace-ingest.ts`) and OTLP ingest (`otlp-ingest.ts`).

### Embrace ingest

The Embrace ingest routes, `/v2/spans` and `/v2/logs` (prefix matches), mirror production (`data.emb-api.com`). Production answers every ingest request with `200` and `0` before it validates anything, so bad payloads never get an error response. This collector replies the same way (except for the `415` below), and still applies production's checks: a valid `X-EM-AID` and `X-EM-DID`, a body within the 3 MiB limit, gzipped JSON, and exactly one resource. Where production silently discards a request, the collector logs a warning naming the reason, what was wrong, and the request's headers and size. If the collector itself fails while recording a payload, it still replies `200` and `0` but logs an error with the stack trace. Preflights on these routes get production's `200` with a 20-day `Access-Control-Max-Age`. `/` answers `200` with `0`, and unknown paths get `404` with `1`.

### OTLP ingest

The collector also accepts standard OTLP/HTTP, so stock OpenTelemetry exporters can send to it without Embrace-specific configuration:

| Path          | Signal  |
| ------------- | ------- |
| `/v1/traces`  | traces  |
| `/v1/logs`    | logs    |
| `/v1/metrics` | metrics |

These routes accept OTLP/JSON (`application/json`), with or without `Content-Encoding: gzip`, and respond as the [OTLP specification](https://opentelemetry.io/docs/specs/otlp/#otlphttp) describes. Bodies over 20 MiB get `413`. Protobuf (`application/x-protobuf`) is rejected with `415`, so point the JSON exporters (for example `@opentelemetry/exporter-trace-otlp-http`) at the collector, not the `-proto` ones.

### SDK contract check

Requests carrying the Embrace SDK's `X-EM-AID` or `X-EM-DID` header must declare `Content-Type: application/json` and `Content-Encoding: gzip` on both Embrace and OTLP ingest routes, as the SDK always does. Any other headers get `415` and are logged as a broken SDK contract.

## Integration tests

This server is also used in the integration tests to verify that logs and traces are being sent correctly.
