import type { IKeyValue } from '@opentelemetry/otlp-transformer/build/esnext/common/internal-types';
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

const logReceivedSessionSpan = (
  resourceSpans: IResourceSpans[],
  sessionSpan: ISpan,
  sessionId: string,
) => {
  const endSessionReason = attributeValueFromSpan(
    sessionSpan,
    'emb.session_end_type',
  );

  logInfo(
    `Session received ${sessionId}. End reason: ${endSessionReason || 'unknown'}`,
  );

  const groupedSpans = groupSpansByType(resourceSpans);

  logReceivedSurfaceSpans(groupedSpans['ux.surface'] || []);
  logReceivedNetworkSpans(groupedSpans['perf.network_request'] || []);
  logBreadcrumbs(sessionSpan);
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

const logBreadcrumbs = (sessionSpan: ISpan) => {
  const breadcrumbSpanEvents = sessionSpan.events.filter(
    (event) => event.name === 'emb-breadcrumb',
  );

  if (breadcrumbSpanEvents.length === 0) {
    logInfo('No breadcrumbs found in session span');
    return;
  }

  logInfo(`Breadcrumbs for session:`);
  breadcrumbSpanEvents.forEach((event, index) => {
    const messageAttr = event.attributes.find((attr) => attr.key === 'message');

    const message = messageAttr ? getAttributeValue(messageAttr) : 'unknown';
    logInfo(`  ${index + 1}. ${message}`);
  });
};

const LOG_RECORD_IGNORED_KEYS = [
  'app.surface.label',
  'log.record.uid',
  'session.id',
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

      const value = getAttributeValue(attr);
      parts.push(`${attr.key}=${value ?? '<unsupported type>'}`);
    }

    const body = record.body?.stringValue
      ? `\n  body=${record.body.stringValue}`
      : '';
    logInfo(`Log record: ${eventName}\n  ${parts.join('\n  ')}${body}`);
  }
};

export { logInfo, logReceivedLogRecords, logReceivedSessionSpan };
