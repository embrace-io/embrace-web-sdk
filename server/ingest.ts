import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IExportLogsServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/logs/internal-types.js';
import type { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types.js';
import type { OtlpJson } from './utils.ts';
import { gunzipCapped, readCappedBody } from './utils.ts';

// Mirrors data.emb-api.com, which replies 200 "0" before validating, so bad payloads still get 200.

type IngestType = 'spans' | 'logs';

// Production also answers oversized bodies with 200 "0".
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const APP_ID_PATTERN = /^[0-9A-Za-z]{5}$/;
const DEVICE_ID_PATTERN = /^[0-9A-Fa-f]{32}$/;
// The uncompressed body the production health check sends.
const PING_BODY = '{}';

type IngestDropReason =
  | 'body_too_large'
  | 'invalid_app_id'
  | 'invalid_device_id'
  | 'empty_body'
  | 'ping_body'
  | 'decode_error'
  | 'invalid_resource_count';

type IngestDrop = {
  ok: false;
  reason: IngestDropReason;
  detail: string;
  bytes: number;
};
type IngestReadResult =
  | { ok: true; type: 'spans'; request: OtlpJson<IExportTraceServiceRequest> }
  | { ok: true; type: 'logs'; request: OtlpJson<IExportLogsServiceRequest> }
  | IngestDrop;

// Production matches these as path prefixes.
const ingestTypeOf = (pathname: string): IngestType | undefined => {
  if (pathname.startsWith('/v2/spans')) return 'spans';
  if (pathname.startsWith('/v2/logs')) return 'logs';
  return undefined;
};

const headerValue = (req: IncomingMessage, name: string): string => {
  const value = req.headers[name];
  return typeof value === 'string' ? value : '';
};

const quoted = (value: string) => (value ? `"${value}"` : 'missing');

const readIngestRequest = async (
  req: IncomingMessage,
  type: IngestType,
): Promise<IngestReadResult> => {
  const { body, bytes } = await readCappedBody(req, MAX_BODY_BYTES);
  const drop = (reason: IngestDropReason, detail: string): IngestDrop => ({
    ok: false,
    reason,
    detail,
    bytes,
  });

  if (body === undefined) {
    return drop(
      'body_too_large',
      `body exceeds the ${MAX_BODY_BYTES}-byte limit`,
    );
  }
  const appId = headerValue(req, 'x-em-aid');
  if (!APP_ID_PATTERN.test(appId)) {
    return drop(
      'invalid_app_id',
      `X-EM-AID is ${quoted(appId)}; expected 5 alphanumeric characters`,
    );
  }
  const deviceId = headerValue(req, 'x-em-did');
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return drop(
      'invalid_device_id',
      `X-EM-DID is ${quoted(deviceId)}; expected 32 hex characters`,
    );
  }
  if (body.length === 0) return drop('empty_body', 'request has no body');
  if (body.toString('utf-8') === PING_BODY) {
    return drop('ping_body', 'body is the uncompressed "{}" health-check ping');
  }

  let json: Buffer;
  try {
    json = gunzipCapped(body);
  } catch (e) {
    return drop('decode_error', `gunzip failed: ${String(e)}`);
  }
  let request: unknown;
  try {
    request = JSON.parse(json.toString('utf-8'));
  } catch (e) {
    return drop('decode_error', `gunzipped body is not JSON: ${String(e)}`);
  }

  // Production keeps only payloads with exactly one resource.
  const key = type === 'spans' ? 'resourceSpans' : 'resourceLogs';
  const resources =
    request && typeof request === 'object'
      ? (request as Record<string, unknown>)[key]
      : undefined;
  if (!Array.isArray(resources)) {
    return drop('invalid_resource_count', `payload has no ${key} array`);
  }
  if (resources.length !== 1) {
    return drop(
      'invalid_resource_count',
      `payload has ${resources.length} ${key} entries; production accepts exactly 1`,
    );
  }
  // Checked only down to the resource count; deeper shape errors throw in the caller's record step.
  return type === 'spans'
    ? {
        ok: true,
        type,
        request: request as OtlpJson<IExportTraceServiceRequest>,
      }
    : {
        ok: true,
        type,
        request: request as OtlpJson<IExportLogsServiceRequest>,
      };
};

const formatRequestContext = (req: IncomingMessage, size: string): string[] => [
  `  X-EM-AID=${quoted(headerValue(req, 'x-em-aid'))} X-EM-DID=${quoted(headerValue(req, 'x-em-did'))}`,
  `  Content-Type=${quoted(headerValue(req, 'content-type'))} Content-Encoding=${quoted(headerValue(req, 'content-encoding'))} ${size}`,
];

// Production discards silently, so the warning carries the full request context.
const formatIngestDrop = (
  req: IncomingMessage,
  type: IngestType,
  drop: IngestDrop,
): string[] => [
  `Dropped ${type} request: ${drop.reason} (production replies 200 "0" and discards it)`,
  `  ${drop.detail}`,
  ...formatRequestContext(req, `bytes=${drop.bytes}`),
];

const formatIngestFailure = (
  req: IncomingMessage,
  type: IngestType,
): string[] => [
  `Collector failed to handle ${type} request; replied 200 "0" as production does`,
  ...formatRequestContext(
    req,
    `Content-Length=${quoted(headerValue(req, 'content-length'))}`,
  ),
];

// Production's body is "0" plus a newline, typed text/html with no charset.
const writeIngestAccepted = (
  res: ServerResponse,
  extraHeaders: Record<string, string> = {},
) => {
  res.writeHead(200, { 'Content-Type': 'text/html', ...extraHeaders });
  res.end('0\n');
};

const writeIngestPreflight = (res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '1728000'); // 20 days
  res.writeHead(200);
  res.end();
};

export type { IngestDrop, IngestType };
export {
  formatIngestDrop,
  formatIngestFailure,
  ingestTypeOf,
  readIngestRequest,
  writeIngestAccepted,
  writeIngestPreflight,
};
