import type { AttributeValue } from '@opentelemetry/api';
import type { Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import {
  EMB_TYPES,
  KEY_EMB_IS_EMBRACE_EXPORT,
  KEY_EMB_TYPE,
} from '../../constants/index.ts';
import { isNetworkSpan, resolveUrl } from '../../utils/index.ts';
import type { EmbraceNetworkSpanProcessorArgs } from './types.ts';

/**
 * Sets emb.type on network spans, and flags requests to the given exporter
 * endpoints with emb.is_embrace_export.
 */
export class EmbraceNetworkSpanProcessor implements SpanProcessor {
  private readonly _embraceExporterEndpoints: ReadonlySet<string>;

  public constructor({
    embraceExporterEndpoints = [],
  }: EmbraceNetworkSpanProcessorArgs = {}) {
    this._embraceExporterEndpoints = new Set(
      embraceExporterEndpoints.map(resolveUrl),
    );
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  // Read in onEnding because isNetworkSpan depends on the HTTP response status, which is only set at span end.
  public onEnding(span: Span): void {
    if (isNetworkSpan(span)) {
      span.attributes[KEY_EMB_TYPE] = EMB_TYPES.Network;
      if (this._isExportRequest(span.attributes[ATTR_URL_FULL])) {
        span.attributes[KEY_EMB_IS_EMBRACE_EXPORT] = true;
      }
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
