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

// File copied mostly from
// https://github.com/open-telemetry/opentelemetry-js/blob/7e30af4c15017f48cbdffa054889c62b2006e4ed/api/src/trace/NonRecordingSpan.ts#L31
// Added ExtendedSpan interface methods

/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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
