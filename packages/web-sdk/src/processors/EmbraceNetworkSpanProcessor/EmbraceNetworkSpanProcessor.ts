import type { AttributeValue } from '@opentelemetry/api';
import type { Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import { isNetworkSpan } from '../../utils/index.ts';
import type { EmbraceNetworkSpanProcessorArgs } from './types.ts';

/**
 * Sets emb.type on network spans: sys.export_request for requests to the given
 * exporter endpoints, perf.network_request otherwise.
 */
export class EmbraceNetworkSpanProcessor implements SpanProcessor {
  private readonly _embraceExporterEndpoints: ReadonlySet<string>;

  public constructor({
    embraceExporterEndpoints = [],
  }: EmbraceNetworkSpanProcessorArgs = {}) {
    // The fetch/XHR instrumentations record url.full as an href resolved against document.baseURI.
    this._embraceExporterEndpoints = new Set(
      embraceExporterEndpoints.map(normalizeUrl),
    );
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
    return typeof url === 'string' && this._embraceExporterEndpoints.has(url);
  }
}

const normalizeUrl = (url: string): string => {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    // fetch rejects the same URL at export; keep it rather than throw from init.
    return url;
  }
};
