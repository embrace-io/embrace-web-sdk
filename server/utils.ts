// Easier to parse incoming requests with a known type, only used for tests
/** biome-ignore-all lint/suspicious/noConsole: We want to log session information here to debug what's coming from the SDK */
// eslint-disable-next-line regex/invalid

import type { IKeyValue } from '@opentelemetry/otlp-transformer/build/esnext/common/internal-types';
import type {
  IResourceSpans,
  ISpan,
} from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types.js';
import pc from 'picocolors';

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
  const embTypeAttr = span.attributes.find((attr) => attr.key === 'emb.type');
  if (!embTypeAttr) {
    return null;
  }

  const value = getAttributeValue(embTypeAttr);
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
  const endSessionReason = sessionSpan.attributes.find(
    (attr) => attr.key === 'emb.session_end_type',
  );

  logInfo(
    `Session received ${sessionId}. End reason: ${endSessionReason ? getAttributeValue(endSessionReason) : 'unknown'}`,
  );

  const groupedSpans = groupSpansByType(resourceSpans);

  logReceivedSurfaceSpans(groupedSpans['ux.surface'] || []);
  logBreadcrumbs(sessionSpan);
};

const logReceivedSurfaceSpans = (surfaceSpans: ISpan[]) => {
  if (surfaceSpans.length === 0) {
    logInfo('No surface spans received');
    return;
  }

  logInfo(`Surface spans received:`);
  surfaceSpans.forEach((span, index) => {
    const nameAttr = span.attributes.find(
      (attr) => attr.key === 'app.surface.name',
    );
    const message = nameAttr ? getAttributeValue(nameAttr) : 'unknown';

    logInfo(`  ${index + 1}. ${message}`);
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

export { logInfo, logReceivedSessionSpan };
