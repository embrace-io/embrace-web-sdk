import type { Attributes } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode, hrTimeToMilliseconds } from '@opentelemetry/core';
import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-web';

// Demo-only visualization aid: taps the SDK's exporter chain so the waterfall
// page can draw a live waterfall of spans and logs. Not shipped in the SDK.

export interface CapturedSpan {
  spanId: string;
  traceId: string;
  name: string;
  startMs: number;
  endMs: number;
  attributes: Attributes;
}

export interface CapturedLog {
  uid: string;
  timeMs: number;
  eventName: string | null;
  embType: string | null;
  severityText: string;
  body: string;
  spanId: string | null;
}

const capturedSpans: CapturedSpan[] = [];
const capturedLogs: CapturedLog[] = [];
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getCapturedSpans = (): readonly CapturedSpan[] => capturedSpans;
export const getCapturedLogs = (): readonly CapturedLog[] => capturedLogs;

export const clearCapture = (): void => {
  capturedSpans.length = 0;
  capturedLogs.length = 0;
  notify();
};

export class CapturingSpanExporter implements SpanExporter {
  public export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const span of spans) {
      capturedSpans.push({
        spanId: span.spanContext().spanId,
        traceId: span.spanContext().traceId,
        name: span.name,
        startMs: hrTimeToMilliseconds(span.startTime),
        endMs: hrTimeToMilliseconds(span.endTime),
        attributes: { ...span.attributes },
      });
    }
    // Capture already succeeded; report success before notifying subscribers so
    // a throwing listener can't leave the export promise unsettled.
    resultCallback({ code: ExportResultCode.SUCCESS });
    notify();
  }

  public shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export class CapturingLogExporter implements LogRecordExporter {
  public forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  public export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const record of logs) {
      const uid = record.attributes['log.record.uid'];
      const embType = record.attributes['emb.type'];
      capturedLogs.push({
        uid: typeof uid === 'string' ? uid : '',
        timeMs: hrTimeToMilliseconds(record.hrTime),
        eventName: record.eventName ?? null,
        embType: typeof embType === 'string' ? embType : null,
        severityText: record.severityText ?? 'unspecified',
        body: record.body == null ? '' : String(record.body),
        // biome-ignore lint/suspicious/noUnnecessaryConditions: a log emitted with no active span has an undefined spanContext at runtime, despite the non-optional type
        spanId: record.spanContext?.spanId ?? null,
      });
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
    notify();
  }

  public shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
