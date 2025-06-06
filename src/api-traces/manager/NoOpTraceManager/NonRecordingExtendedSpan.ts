import type {
  SpanContext,
  TimeInput,
  Link,
  SpanStatus,
  Exception,
  Attributes,
} from '@opentelemetry/api';
import { INVALID_SPAN_CONTEXT } from '@opentelemetry/api';
import type {
  ExtendedSpan,
  ExtendedSpanFailedOptions,
} from '../../api/index.js';

export class NonRecordingExtendedSpan implements ExtendedSpan {
  private readonly _spanContext: SpanContext;

  public constructor(_spanContext: SpanContext = INVALID_SPAN_CONTEXT) {
    this._spanContext = _spanContext;
  }

  public fail(_options?: ExtendedSpanFailedOptions) {}

  public spanContext(): SpanContext {
    return this._spanContext;
  }

  public setAttribute(_key: string, _value: unknown): this {
    return this;
  }

  public setAttributes(_attributes: Attributes): this {
    return this;
  }

  public addEvent(
    _name: string,
    _attributesOrStartTime?: Attributes | TimeInput,
    _startTime?: TimeInput
  ): this {
    return this;
  }

  public addLink(_link: Link): this {
    return this;
  }

  public addLinks(_links: Link[]): this {
    return this;
  }

  public setStatus(_status: SpanStatus): this {
    return this;
  }

  public updateName(_name: string): this {
    return this;
  }

  public end(_endTime?: TimeInput): void {}

  public isRecording(): boolean {
    return false;
  }

  public recordException(_exception: Exception, _time?: TimeInput): void {}
}
