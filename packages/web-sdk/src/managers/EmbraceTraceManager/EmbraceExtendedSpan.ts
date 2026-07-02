import type {
  Attributes,
  AttributeValue,
  Exception,
  Link,
  Span,
  SpanContext,
  SpanStatus,
  TimeInput,
} from '@opentelemetry/api';
import type {
  ExtendedSpan,
  ExtendedSpanFailedOptions,
} from '../../api-traces/api/TraceAPI/types.ts';
import { KEY_EMB_ERROR_CODE } from '../../constants/attributes.ts';

/**
 * EmbraceSpan for the most part simply delegates to the underlying Span it receives on initialization so
 * that it satisfies the Span interface. In addition, it gives us a spot where we can implement helpers that are part
 * of the EmbraceSpan interface.
 */
export class EmbraceExtendedSpan implements ExtendedSpan {
  private readonly _span: ExtendedSpan;

  public constructor(span: Span) {
    this._span = span as ExtendedSpan;
  }

  /**
   * Expose attributes by extending OpenTelemetry's ReadableSpan.
   */
  public get attributes(): Attributes {
    return this._span.attributes;
  }

  public addEvent(
    name: string,
    attributesOrStartTime?: Attributes | TimeInput,
    startTime?: TimeInput,
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

  public removeAttribute(key: string): this {
    const { [key]: _, ...attributes } = this._span.attributes;
    // @ts-expect-error Read/write spans are allowed per the spec https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/sdk.md#additional-span-interfaces
    this._span.attributes = attributes;
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
    },
  ): void {
    if (options.code) {
      this._span.setAttribute(KEY_EMB_ERROR_CODE, options.code.toUpperCase());
    }

    this._span.end(options.endTime);
  }
}
