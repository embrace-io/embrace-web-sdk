import type { IncomingMessage } from 'node:http';
import zlib from 'node:zlib';
import type {
  IAnyValue,
  IKeyValue,
} from '@opentelemetry/otlp-transformer/build/esnext/common/internal-types.js';
import type { ILogRecord } from '@opentelemetry/otlp-transformer/build/esnext/logs/internal-types.js';
import type { IResourceMetrics } from '@opentelemetry/otlp-transformer/build/esnext/metrics/internal-types.js';
import type {
  IResourceSpans,
  ISpan,
} from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types.js';
import pc from 'picocolors';

// OTLP/JSON omits empty fields, including ones the otlp-transformer types mark required.
type OtlpJson<T> = T extends Uint8Array
  ? T
  : T extends (infer Item)[]
    ? OtlpJson<Item>[]
    : T extends object
      ? { [Key in keyof T]?: OtlpJson<T[Key]> }
      : T;

const attributeValueFromSpan = (span: OtlpJson<ISpan>, key: string) => {
  const attr = (span.attributes ?? []).find((attr) => attr.key === key);
  return attr && getAttributeValue(attr);
};

const getAttributeValue = (
  attr: OtlpJson<IKeyValue>,
): string | number | boolean | null => {
  const value = attr.value;

  if (value?.stringValue !== undefined) {
    return value.stringValue;
  }

  if (value?.intValue !== undefined) {
    return value.intValue;
  }

  if (value?.boolValue !== undefined) {
    return value.boolValue;
  }

  if (value?.doubleValue !== undefined) {
    return value.doubleValue;
  }

  return null;
};

const renderAttributeValue = (
  value: OtlpJson<IAnyValue> | undefined,
): string => {
  if (!value) {
    return '<empty>';
  }
  if (value.stringValue !== undefined && value.stringValue !== null) {
    return value.stringValue;
  }
  if (value.intValue !== undefined && value.intValue !== null) {
    return String(value.intValue);
  }
  if (value.boolValue !== undefined && value.boolValue !== null) {
    return String(value.boolValue);
  }
  if (value.doubleValue !== undefined && value.doubleValue !== null) {
    return String(value.doubleValue);
  }
  if (value.arrayValue) {
    return `[${(value.arrayValue.values ?? []).map(renderAttributeValue).join(', ')}]`;
  }
  if (value.kvlistValue) {
    const entries = (value.kvlistValue.values ?? [])
      .map((kv) => `${kv.key}=${renderAttributeValue(kv.value)}`)
      .join(', ');
    return `{${entries}}`;
  }
  if (value.bytesValue !== undefined && value.bytesValue !== null) {
    const length =
      typeof value.bytesValue === 'string'
        ? value.bytesValue.length
        : value.bytesValue.byteLength;
    return `<${length} bytes>`;
  }
  return '<empty>';
};

const getEmbType = (span: OtlpJson<ISpan>): string | null => {
  const value = attributeValueFromSpan(span, 'emb.type');
  return typeof value === 'string' ? value : null;
};

/**
 * Groups spans by their emb.type attribute value
 * Flattens the IResourceSpans[] structure to collect all spans and organize them by type
 */
const groupSpansByType = (
  resourceSpans: OtlpJson<IResourceSpans>[],
): Record<string, OtlpJson<ISpan>[]> => {
  const grouped: Record<string, OtlpJson<ISpan>[]> = {};

  for (const resource of resourceSpans) {
    for (const scopeSpan of resource.scopeSpans ?? []) {
      for (const span of scopeSpan.spans ?? []) {
        const embType = getEmbType(span);

        if (embType) {
          if (!grouped[embType]) {
            grouped[embType] = [];
          }
          grouped[embType].push(span);
        }
      }
    }
  }

  return grouped;
};

const getTimestamp = () => {
  const now = new Date();

  return pc.gray(
    `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`,
  );
};

const SGR_SEQUENCE = /\[[0-9;]*m/y;

// Logs echo client-sent text: keep color (SGR) sequences, escape every other control character
// so a request cannot move the cursor, rewrite lines, or send OSC commands to the terminal.
const printable = (message: string): string => {
  let result = '';
  for (let index = 0; index < message.length; index++) {
    const code = message.charCodeAt(index);
    const isControl =
      (code < 0x20 && code !== 0x0a && code !== 0x09) ||
      (code >= 0x7f && code <= 0x9f);
    SGR_SEQUENCE.lastIndex = index + 1;
    if (!isControl || (code === 0x1b && SGR_SEQUENCE.test(message))) {
      result += message[index];
    } else {
      result += `\\x${code.toString(16).padStart(2, '0')}`;
    }
  }
  return result;
};

const logInfo = (message: string) => {
  console.log(
    `[SERVER] ${getTimestamp()} ${pc.blue('ℹ')} ${printable(message)}`,
  );
};

const logWarn = (message: string) => {
  console.warn(
    `[SERVER] ${getTimestamp()} ${pc.yellow('⚠')} ${printable(message)}`,
  );
};

const logError = (message: string, error: unknown) => {
  const detail =
    error instanceof Error ? (error.stack ?? String(error)) : String(error);
  console.error(
    `[SERVER] ${getTimestamp()} ${pc.red(pc.bold(`✖ ${printable(message)}`))}\n${pc.red(printable(detail))}`,
  );
};

// Stream errors on an incoming request mean the client went away, so no response can be sent.
class RequestAbortedError extends Error {
  readonly bytes: number;

  constructor(bytes: number, cause: unknown) {
    super(`request stream failed after ${bytes} bytes`, { cause });
    this.bytes = bytes;
  }
}

// Keeps reading past the limit so the response can still be sent, but stops buffering.
const readCappedBody = (
  req: IncomingMessage,
  maxBytes: number,
): Promise<{ body: Buffer | undefined; bytes: number }> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes <= maxBytes) chunks.push(chunk);
    });
    req.on('error', (error) => reject(new RequestAbortedError(bytes, error)));
    req.on('end', () =>
      resolve({
        body: bytes > maxBytes ? undefined : Buffer.concat(chunks),
        bytes,
      }),
    );
  });

// Collector-only guard: a body within the wire limit can still gunzip to gigabytes.
const MAX_DECODED_BYTES = 64 * 1024 * 1024;

const gunzipCapped = (body: Buffer): Buffer =>
  zlib.gunzipSync(body, { maxOutputLength: MAX_DECODED_BYTES });

const logReceivedSessionPartSpan = (
  resourceSpans: OtlpJson<IResourceSpans>[],
  sessionPartSpan: OtlpJson<ISpan>,
  userSessionId: string,
) => {
  const sessionPartId =
    attributeValueFromSpan(sessionPartSpan, 'emb.session_part_id') ??
    '<unknown>';

  logInfo(
    `Session part received ${sessionPartId} (user session ${userSessionId}):`,
  );
  const sortedAttrs = [...(sessionPartSpan.attributes ?? [])].sort((a, b) =>
    (a.key ?? '').localeCompare(b.key ?? ''),
  );
  for (const attr of sortedAttrs) {
    logInfo(`  ${attr.key}=${renderAttributeValue(attr.value)}`);
  }

  const groupedSpans = groupSpansByType(resourceSpans);

  logReceivedSurfaceSpans(groupedSpans['ux.surface'] || []);
  logReceivedNetworkSpans(groupedSpans['perf.network_request'] || []);
  logBreadcrumbs(sessionPartSpan);
};

const logReceivedSurfaceSpans = (surfaceSpans: OtlpJson<ISpan>[]) => {
  if (surfaceSpans.length === 0) {
    logInfo('No surface spans received');
    return;
  }

  logInfo(`Surface spans received:`);
  surfaceSpans.forEach((span, index) => {
    const message =
      attributeValueFromSpan(span, 'app.surface.name') || 'unknown';

    logInfo(`  ${index + 1}. ${message}`);
  });
};

const logReceivedNetworkSpans = (networkSpans: OtlpJson<ISpan>[]) => {
  if (networkSpans.length === 0) {
    logInfo('No network spans received');
    return;
  }

  logInfo(`Network spans received:`);
  networkSpans.forEach((span, index) => {
    const method = attributeValueFromSpan(span, 'http.request.method');
    const url = attributeValueFromSpan(span, 'url.full');
    const statusCode = attributeValueFromSpan(
      span,
      'http.response.status_code',
    );

    logInfo(`  ${index + 1}. ${method} ${url} -> ${statusCode}`);
  });
};

const logBreadcrumbs = (sessionPartSpan: OtlpJson<ISpan>) => {
  const breadcrumbSpanEvents = (sessionPartSpan.events ?? []).filter(
    (event) => event.name === 'emb-breadcrumb',
  );

  if (breadcrumbSpanEvents.length === 0) {
    logInfo('No breadcrumbs found in session part span');
    return;
  }

  logInfo(`Breadcrumbs for session part:`);
  breadcrumbSpanEvents.forEach((event, index) => {
    const messageAttr = (event.attributes ?? []).find(
      (attr) => attr.key === 'message',
    );

    const message = messageAttr ? getAttributeValue(messageAttr) : 'unknown';
    logInfo(`  ${index + 1}. ${message}`);
  });
};

const SEVERITY_NUMBER_WARN = 13;

const LOG_RECORD_IGNORED_KEYS = [
  'emb.js_file_bundle_ids',
  'emb.session_part_id',
  'emb.stacktrace.js',
  'emb.user_session_id',
  'emb.user_session_previous_id',
  'log.record.uid',
  'user.id',
];

const logReceivedLogRecords = (logRecords: OtlpJson<ILogRecord>[]) => {
  if (logRecords.length === 0) {
    logWarn('Batch contained 0 log records');
    return;
  }

  for (const record of logRecords) {
    const eventName = record.eventName ?? '<no eventName>';
    const parts: string[] = [];

    for (const attr of record.attributes ?? []) {
      if (attr.key && LOG_RECORD_IGNORED_KEYS.includes(attr.key)) {
        continue;
      }

      parts.push(`${attr.key}=${renderAttributeValue(attr.value)}`);
    }

    const body = record.body?.stringValue
      ? `\n  body=${record.body.stringValue}`
      : '';
    const log =
      (record.severityNumber ?? 0) >= SEVERITY_NUMBER_WARN ? logWarn : logInfo;
    log(`LOG eventName: ${eventName}\n  ${parts.join('\n  ')}${body}`);
  }
};

const formatDurationMs = (
  startUnixNano: string | number | undefined,
  endUnixNano: string | number | undefined,
): string => {
  if (startUnixNano === undefined || endUnixNano === undefined) return '?';
  const ms = Number((BigInt(endUnixNano) - BigInt(startUnixNano)) / 1_000_000n);
  return `${ms}ms`;
};

const logReceivedSpans = (resourceSpans: OtlpJson<IResourceSpans>[]) => {
  let total = 0;
  for (const resource of resourceSpans) {
    for (const scopeSpan of resource.scopeSpans ?? []) {
      for (const span of scopeSpan.spans ?? []) {
        total++;
        const embType = getEmbType(span) ?? '-';
        const dur = formatDurationMs(
          span.startTimeUnixNano as string | number | undefined,
          span.endTimeUnixNano as string | number | undefined,
        );
        logInfo(`Span: ${pc.cyan(span.name)} [emb.type=${embType}] dur=${dur}`);
      }
    }
  }
  if (total === 0) {
    logWarn('Batch contained 0 spans');
  } else {
    logInfo(`Batch contained ${total} span(s)`);
  }
};

const METRIC_DATA_KEYS = [
  'sum',
  'gauge',
  'histogram',
  'exponentialHistogram',
  'summary',
] as const;

const logReceivedMetrics = (resourceMetrics: OtlpJson<IResourceMetrics>[]) => {
  let total = 0;
  for (const resource of resourceMetrics) {
    for (const scopeMetric of resource.scopeMetrics ?? []) {
      for (const metric of scopeMetric.metrics ?? []) {
        total++;
        const dataKey = METRIC_DATA_KEYS.find(
          (key) => metric[key] !== undefined,
        );
        const points = dataKey ? (metric[dataKey]?.dataPoints ?? []).length : 0;
        logInfo(
          `Metric: ${pc.cyan(metric.name)} type=${dataKey ?? 'unknown'} points=${points}`,
        );
      }
    }
  }
  if (total === 0) {
    logWarn('Batch contained 0 metrics');
  } else {
    logInfo(`Batch contained ${total} metric(s)`);
  }
};

export type { OtlpJson };
export {
  gunzipCapped,
  logError,
  logInfo,
  logReceivedLogRecords,
  logReceivedMetrics,
  logReceivedSessionPartSpan,
  logReceivedSpans,
  logWarn,
  RequestAbortedError,
  readCappedBody,
};
