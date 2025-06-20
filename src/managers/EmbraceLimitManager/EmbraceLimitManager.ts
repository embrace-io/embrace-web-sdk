import type { AttributeValue, DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';

import type { EmbraceLimitManagerArgs, LimitManagerInternal } from './types.js';
import type { LogSeverity } from '../../api-logs/index.js';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';

export class EmbraceLimitManager implements LimitManagerInternal {
  private readonly _diag: DiagLogger;
  private readonly _maxLogsBySeverity: Record<LogSeverity, number>;
  private readonly _maxLogLength: number;
  private readonly _maxNetworkRequests: number;
  private readonly _maxSpans: number;
  private readonly _maxSpanAttributes: number;
  private readonly _maxSpanEvents: number;
  private readonly _maxAttributesPerSpanEvent: number;
  private readonly _maxBreadcrumbs: number;
  private readonly _maxBreadcrumbLength: number;
  private readonly _maxSessionProperties: number;

  private _breadcrumbCount: number = 0;
  private _spanCount: number = 0;
  private _logCountBySeverity: Record<LogSeverity, number> = {
    info: 0,
    warning: 0,
    error: 0,
  };
  private _networkRequestCount: number = 0;
  private _sessionPropertyCount: number = 0;

  public constructor({
    diag: diagParam,
    maxLogsBySeverity,
    maxLogLength,
    maxNetworkRequests,
    maxSpans,
    maxSpanAttributes,
    maxSpanEvents,
    maxAttributesPerSpanEvent,
    maxBreadcrumbs,
    maxBreadcrumbLength,
    maxSessionProperties,
  }: EmbraceLimitManagerArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceLimitManager',
      });

    this._maxLogsBySeverity = maxLogsBySeverity;
    this._maxLogLength = maxLogLength;
    this._maxNetworkRequests = maxNetworkRequests;
    this._maxSpans = maxSpans;
    this._maxSpanAttributes = maxSpanAttributes;
    this._maxSpanEvents = maxSpanEvents;
    this._maxAttributesPerSpanEvent = maxAttributesPerSpanEvent;
    this._maxBreadcrumbs = maxBreadcrumbs;
    this._maxBreadcrumbLength = maxBreadcrumbLength;
    this._maxSessionProperties = maxSessionProperties;
  }

  public allowBreadcrumb(name: string): boolean {
    if (name.length > this._maxBreadcrumbLength) {
      this._diag.warn(
        `disallowing breadcrumb because the name is longer than ${this._maxBreadcrumbLength.toString()}: "${name}"`
      );

      // TODO should we allow but just truncate in this case?

      return false;
    }

    if (this._breadcrumbCount >= this._maxBreadcrumbs) {
      this._diag.warn(
        `disallowing breadcrumb because the maximum number of ${this._maxBreadcrumbs.toString()} has already been reached for this session`
      );
      return false;
    }

    this._breadcrumbCount++;
    return true;
  }

  public allowLog(
    message: string,
    severity: LogSeverity,
    attributes: Record<string, AttributeValue | undefined>
  ): boolean {
    if (message.length > this._maxLogLength) {
      this._diag.warn(
        `disallowing log because the message is longer than ${this._maxLogLength.toString()}: "${message}"`
      );

      // TODO should we allow but just truncate in this case?

      return false;
    }

    if (
      this._logCountBySeverity[severity] >= this._maxLogsBySeverity[severity]
    ) {
      this._diag.warn(
        `disallowing ${severity} log because the maximum of number ${this._maxLogsBySeverity[severity].toString()} ${severity} has already been reached for this session`
      );
      return false;
    }

    // TODO any limits on log attributes?
    console.log(attributes);

    this._logCountBySeverity[severity]++;
    return true;
  }

  public allowSessionProperty(key: string, value: string): boolean {
    if (this._sessionPropertyCount >= this._maxSessionProperties) {
      this._diag.warn(
        `disallowing session property because the maximum number of ${this._maxSessionProperties.toString()} has already been reached for this session`
      );
      return false;
    }

    // TODO any limits on session property key or value lengths?
    console.log(key, value);

    this._sessionPropertyCount++;
    return true;
  }

  public allowSpan(span: ReadableSpan): boolean {
    const isNetwork = span.attributes[KEY_EMB_TYPE] === EMB_TYPES.Network;

    if (isNetwork && this._networkRequestCount >= this._maxNetworkRequests) {
      this._diag.warn(
        `disallowing network request because the maximum number of ${this._maxNetworkRequests.toString()} has already been reached for this session`
      );
      return false;
    }

    if (!isNetwork && this._spanCount >= this._maxSpans) {
      this._diag.warn(
        `disallowing network request because the maximum number of ${this._maxNetworkRequests.toString()} has already been reached for this session`
      );
      return false;
    }

    if (Object.keys(span.attributes).length > this._maxSpanAttributes) {
      this._diag.warn(
        `disallowing span because there are more than ${this._maxSpanAttributes.toString()} attributes set`
      );

      // TODO should we allow but just truncate in this case?
      return false;
    }

    if (span.events.length > this._maxSpanEvents) {
      this._diag.warn(
        `disallowing span because there are more than ${this._maxSpanEvents.toString()} events set`
      );
      return false;
    }

    for (let i = 0; i < span.events.length; i++) {
      const event = span.events[i];
      const attributes = event.attributes;

      if (!attributes) {
        continue;
      }

      if (Object.keys(attributes).length > this._maxAttributesPerSpanEvent) {
        this._diag.warn(
          `disallowing span because there are more than ${this._maxAttributesPerSpanEvent.toString()} attributes set on its ${event.name} event`
        );
        return false;
      }
    }

    if (isNetwork) {
      this._networkRequestCount++;
    } else {
      this._spanCount++;
    }
    return true;
  }

  public reset(): void {
    this._breadcrumbCount = 0;
    this._spanCount = 0;
    this._networkRequestCount = 0;
    this._sessionPropertyCount = 0;
    this._logCountBySeverity = {
      info: 0,
      warning: 0,
      error: 0,
    };
  }
}
