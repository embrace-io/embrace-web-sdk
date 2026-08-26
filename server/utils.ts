import type {
  IAnyValue,
  IKeyValue,
} from '@opentelemetry/otlp-transformer/build/esnext/common/internal-types.js';
import type { ILogRecord } from '@opentelemetry/otlp-transformer/build/esnext/logs/internal-types.js';
import type {
  IResourceSpans,
  ISpan,
} from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types.js';
import pc from 'picocolors';

const attributeValueFromSpan = (span: ISpan, key: string) => {
  const attr = span.attributes.find((attr) => attr.key === key);
  return attr && getAttributeValue(attr);
};

const getAttributeValue = (
  attr: IKeyValue,
): string | number | boolean | null => {
  if (attr.value.stringValue !== undefined) {
    return attr.value.stringValue;
  }

  if (attr.value.intValue !== undefined) {
    return attr.value.intValue;
  }

  if (attr.value.boolValue !== undefined) {
    return attr.value.boolValue;
  }

  if (attr.value.doubleValue !== undefined) {
    return attr.value.doubleValue;
  }

  return null;
};

const renderAttributeValue = (value: IAnyValue): string => {
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
    return `[${value.arrayValue.values.map(renderAttributeValue).join(', ')}]`;
  }
  if (value.kvlistValue) {
    const entries = value.kvlistValue.values
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

const getEmbType = (span: ISpan): string | null => {
  const value = attributeValueFromSpan(span, 'emb.type');
  return typeof value === 'string' ? value : null;
};

/**
 * Groups spans by their emb.type attribute value
 * Flattens the IResourceSpans[] structure to collect all spans and organize them by type
 */
const groupSpansByType = (
  resourceSpans: IResourceSpans[],
): Record<string, ISpan[]> => {
  const grouped: Record<string, ISpan[]> = {};

  for (const resource of resourceSpans) {
    for (const scopeSpan of resource.scopeSpans) {
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

const logInfo = (message: string) => {
  console.log(`[SERVER] ${getTimestamp()} ${pc.blue('ℹ')} ${message}`);
};

const logWarn = (message: string) => {
  console.warn(`[SERVER] ${getTimestamp()} ${pc.yellow('⚠')} ${message}`);
};

const logReceivedSessionPartSpan = (
  resourceSpans: IResourceSpans[],
  sessionPartSpan: ISpan,
  userSessionId: string,
) => {
  const sessionPartId =
    attributeValueFromSpan(sessionPartSpan, 'emb.session_part_id') ??
    '<unknown>';

  logInfo(
    `Session part received ${sessionPartId} (user session ${userSessionId}):`,
  );
  const sortedAttrs = [...sessionPartSpan.attributes].sort((a, b) =>
    a.key.localeCompare(b.key),
  );
  for (const attr of sortedAttrs) {
    logInfo(`  ${attr.key}=${renderAttributeValue(attr.value)}`);
  }

  const groupedSpans = groupSpansByType(resourceSpans);

  logReceivedSurfaceSpans(groupedSpans['ux.surface'] || []);
  logReceivedNetworkSpans(groupedSpans['perf.network_request'] || []);
  logBreadcrumbs(sessionPartSpan);
};

const logReceivedSurfaceSpans = (surfaceSpans: ISpan[]) => {
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

const logReceivedNetworkSpans = (networkSpans: ISpan[]) => {
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

const logBreadcrumbs = (sessionPartSpan: ISpan) => {
  const breadcrumbSpanEvents = sessionPartSpan.events.filter(
    (event) => event.name === 'emb-breadcrumb',
  );

  if (breadcrumbSpanEvents.length === 0) {
    logInfo('No breadcrumbs found in session part span');
    return;
  }

  logInfo(`Breadcrumbs for session part:`);
  breadcrumbSpanEvents.forEach((event, index) => {
    const messageAttr = event.attributes.find((attr) => attr.key === 'message');

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

const logReceivedLogRecords = (logRecords: ILogRecord[]) => {
  if (logRecords.length === 0) {
    return;
  }

  for (const record of logRecords) {
    const eventName = record.eventName ?? '<no eventName>';
    const parts: string[] = [];

    for (const attr of record.attributes ?? []) {
      if (LOG_RECORD_IGNORED_KEYS.includes(attr.key)) {
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

const logReceivedSpans = (resourceSpans: IResourceSpans[]) => {
  let total = 0;
  for (const resource of resourceSpans) {
    for (const scopeSpan of resource.scopeSpans) {
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
    logInfo('Batch contained 0 spans');
  } else {
    logInfo(`Batch contained ${total} span(s)`);
  }
};

export {
  logInfo,
  logReceivedLogRecords,
  logReceivedSessionPartSpan,
  logReceivedSpans,
  logWarn,
};
