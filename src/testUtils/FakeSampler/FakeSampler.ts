import type { Attributes, Link, SpanKind } from '@opentelemetry/api';
import { type Context } from '@opentelemetry/api';
import type { Sampler, SamplingResult } from '@opentelemetry/sdk-trace-web';
import { SamplingDecision } from '@opentelemetry/sdk-trace-web';

export class FakeSampler implements Sampler {
  public constructor(private _allowSpans = false) {}

  public get allowSpans() {
    return this._allowSpans;
  }

  public set allowSpans(allowSpans: boolean) {
    this._allowSpans = allowSpans;
  }

  public shouldSample(
    _context: Context,
    _traceId: string,
    _spanName: string,
    _spanKind: SpanKind,
    _attributes: Attributes,
    _links: Link[]
  ): SamplingResult {
    return {
      decision: this._allowSpans
        ? SamplingDecision.RECORD_AND_SAMPLED
        : SamplingDecision.NOT_RECORD,
    };
  }
}
