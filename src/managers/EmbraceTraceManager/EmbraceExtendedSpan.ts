import type {
  Exception,
  Link,
  Attributes,
  AttributeValue,
  SpanContext,
  SpanStatus,
  TimeInput,
} from '@opentelemetry/api';
import { type Span } from '@opentelemetry/api';
import type {
  ExtendedSpan,
  ExtendedSpanFailedOptions,
} from '../../api-traces/index.js';
import { KEY_EMB_ERROR_CODE } from '../../constants/index.js';

/**
 * EmbraceSpan for the most part simply delegates to the underlying Span it receives on initialization so
 * that it satisfies the Span interface. In addition, it gives us a spot where we can implement helpers that are part
 * of the EmbraceSpan interface.
 */
export class EmbraceExtendedSpan implements ExtendedSpan {
  private readonly _span: Span;

  public constructor(span: Span) {
    this._span = span;
  }

  public addEvent(
    name: string,
    attributesOrStartTime?: Attributes | TimeInput,
    startTime?: TimeInput
  ): this {
    this._span.addEvent(name, attributesOrStartTime, startTime);
    return this;
  }

  public addLink(link: Link): this {
    this._span.addLink(link);
    return this;
  }

  public addLinks(links: Link[]): this {
    this._span.addLinks(links);
    return this;
  }

  public end(endTime?: TimeInput): void {
    this._span.end(endTime);
  }

  public isRecording(): boolean {
    return this._span.isRecording();
  }

  public recordException(exception: Exception, time?: TimeInput): void {
    this._span.recordException(exception, time);
  }

  public setAttribute(key: string, value: AttributeValue): this {
    this._span.setAttribute(key, value);
    return this;
  }

  public setAttributes(attributes: Attributes): this {
    this._span.setAttributes(attributes);
    return this;
  }

  public setStatus(status: SpanStatus): this {
    this._span.setStatus(status);
    return this;
  }

  public spanContext(): SpanContext {
    return this._span.spanContext();
  }

  public updateName(name: string): this {
    this._span.updateName(name);
    return this;
  }

  public fail(
    options: ExtendedSpanFailedOptions = {
      code: 'failure',
    }
  ): void {
    if (options.code) {
      this._span.setAttribute(KEY_EMB_ERROR_CODE, options.code.toUpperCase());
    }

    this._span.end(options.endTime);
  }
}
