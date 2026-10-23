import type { AttributeValue } from '@opentelemetry/api';
import type { Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import { isNetworkSpan } from '../../utils/index.ts';
import type { EmbraceNetworkSpanProcessorArgs } from './types.ts';

/**
 * Embrace's API expects network spans to have some specific attributes.
 * This processor checks if a span is a network span and adds them.
 */
export class EmbraceNetworkSpanProcessor implements SpanProcessor {
  private readonly _exporterEndpoints: ReadonlySet<string>;

  public constructor({
    exporterEndpoints = [],
  }: EmbraceNetworkSpanProcessorArgs = {}) {
    // Network instrumentations record url.full as a parsed href, so compare in that form.
    this._exporterEndpoints = new Set(exporterEndpoints.map(normalizeUrl));
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  // Read in onEnding because isNetworkSpan depends on the HTTP response status, which is only set at span end.
  public onEnding(span: Span): void {
    if (isNetworkSpan(span)) {
      span.attributes[KEY_EMB_TYPE] = this._isExportRequest(
        span.attributes[ATTR_URL_FULL],
      )
        ? EMB_TYPES.ExportRequest
        : EMB_TYPES.Network;
    }
  }

  public onStart(this: void): void {
    // do nothing.
  }

  public onEnd(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }

  private _isExportRequest(url: AttributeValue | undefined): boolean {
    return typeof url === 'string' && this._exporterEndpoints.has(url);
  }
}

const normalizeUrl = (url: string): string => {
  try {
    return new URL(url).href;
  } catch {
    // An unparseable URL fails at export too; keep it rather than throw from init.
    return url;
  }
};
