import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IExportLogsServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/logs/internal-types.js';
import type { IExportMetricsServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/metrics/internal-types.js';
import type { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types.js';
import type { OtlpJson } from './utils.ts';
import { gunzipCapped, logError, logWarn, readCappedBody } from './utils.ts';

type OtlpSignal = 'traces' | 'logs' | 'metrics';

// Bounds memory per request; far above any real export batch.
const MAX_BODY_BYTES = 20 * 1024 * 1024;

// The OTLP/HTTP default paths that exporters append to OTEL_EXPORTER_OTLP_ENDPOINT.
const otlpSignalOf = (pathname: string): OtlpSignal | undefined => {
  switch (pathname) {
    case '/v1/traces':
      return 'traces';
    case '/v1/logs':
      return 'logs';
    case '/v1/metrics':
      return 'metrics';
    default:
      return undefined;
  }
};

// Client errors are results, not throws, so .catch() sees only collector faults (500).
type OtlpRejection = {
  ok: false;
  status: 400 | 413 | 415;
  message: string;
  // Logged only; the response body carries just message.
  cause?: unknown;
};

type OtlpReadResult =
  | {
      ok: true;
      signal: 'traces';
      request: OtlpJson<IExportTraceServiceRequest>;
    }
  | { ok: true; signal: 'logs'; request: OtlpJson<IExportLogsServiceRequest> }
  | {
      ok: true;
      signal: 'metrics';
      request: OtlpJson<IExportMetricsServiceRequest>;
    }
  | OtlpRejection;

const rejection = (
  status: OtlpRejection['status'],
  message: string,
  cause?: unknown,
): OtlpRejection => ({ ok: false, status, message, cause });

// JSON only: otlp-transformer can't decode protobuf requests.
const readOtlpRequest = async (
  req: IncomingMessage,
  signal: OtlpSignal,
): Promise<OtlpReadResult> => {
  const contentType = req.headers['content-type'] ?? '';
  if (contentType.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return rejection(
      415,
      `unsupported Content-Type "${contentType}", expected application/json`,
    );
  }
  const contentEncoding = req.headers['content-encoding'];
  const encoding = contentEncoding?.trim().toLowerCase();
  if (encoding && encoding !== 'identity' && encoding !== 'gzip') {
    return rejection(415, `unsupported Content-Encoding "${contentEncoding}"`);
  }

  const { body, bytes } = await readCappedBody(req, MAX_BODY_BYTES);
  if (body === undefined) {
    return rejection(
      413,
      `body is ${bytes} bytes, over the ${MAX_BODY_BYTES}-byte limit`,
    );
  }
  let json = body;
  if (encoding === 'gzip') {
    try {
      json = gunzipCapped(body);
    } catch (e) {
      return rejection(400, 'body is not valid gzip', e);
    }
  }
  let request: unknown;
  try {
    request = JSON.parse(json.toString('utf-8'));
  } catch (e) {
    return rejection(400, 'body is not valid JSON', e);
  }
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return rejection(400, 'body is not a JSON object');
  }

  switch (signal) {
    case 'traces':
      return {
        ok: true,
        signal,
        request: request as OtlpJson<IExportTraceServiceRequest>,
      };
    case 'logs':
      return {
        ok: true,
        signal,
        request: request as OtlpJson<IExportLogsServiceRequest>,
      };
    case 'metrics':
      return {
        ok: true,
        signal,
        request: request as OtlpJson<IExportMetricsServiceRequest>,
      };
  }
};

// `{}` is an empty Export*ServiceResponse, the success body OTLP expects.
const writeOtlpSuccess = (res: ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{}');
};

const writeOtlpRejection = (
  res: ServerResponse,
  signal: OtlpSignal,
  rejection: OtlpRejection,
) => {
  const cause =
    rejection.cause === undefined ? '' : ` (${String(rejection.cause)})`;
  logWarn(
    `Rejected OTLP ${signal} request (${rejection.status}): ${rejection.message}${cause}`,
  );
  res.writeHead(rejection.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: rejection.message }));
};

const writeOtlpServerError = (
  res: ServerResponse,
  signal: OtlpSignal,
  error: unknown,
) => {
  logError(
    `Collector failed to handle OTLP ${signal} request; replied 500`,
    error,
  );
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'internal collector error' }));
};

export type { OtlpSignal };
export {
  otlpSignalOf,
  readOtlpRequest,
  writeOtlpRejection,
  writeOtlpServerError,
  writeOtlpSuccess,
};
