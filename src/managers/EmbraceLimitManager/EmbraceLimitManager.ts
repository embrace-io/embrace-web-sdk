import type { AttributeValue, DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';

import type {
  AttributeLimitedType,
  EmbraceLimitManagerArgs,
  LengthLimitedType,
  LimitedBreadcrumb,
  LimitedException,
  LimitedLog,
  LimitedSessionProperty,
  LimitedType,
  LimitManagerInternal,
  LimitOperation,
  LogLimitedType,
  MaxLimitedType,
} from './types.js';
import type { LogSeverity } from '../../api-logs/index.js';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';

const LogSeverityToLimitType: Record<LogSeverity, LogLimitedType> = {
  info: 'info_log',
  warning: 'warning_log',
  error: 'error_log',
};

export class EmbraceLimitManager implements LimitManagerInternal {
  private readonly _diag: DiagLogger;

  private _diagnosticCounts: Record<string, number> = {};
  private _currentCount: Record<MaxLimitedType, number> = {
    exception: 0,
    error_log: 0,
    warning_log: 0,
    info_log: 0,
    breadcrumb: 0,
    session_property: 0,
    span: 0,
    network_request: 0,
  };
  private readonly _maxAllowed: Record<MaxLimitedType, number>;
  private readonly _maxLength: Record<LengthLimitedType, number>;
  private readonly _maxAttributes: Record<AttributeLimitedType, number>;

  public constructor({
    diag: diagParam,
    maxAllowed,
    maxLength,
    maxAttributes,
  }: EmbraceLimitManagerArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceLimitManager',
      });

    this._maxAllowed = maxAllowed;
    this._maxLength = maxLength;
    this._maxAttributes = maxAttributes;
  }

  private _dropIfMaxReached(type: MaxLimitedType): boolean {
    if (this._currentCount[type] >= this._maxAllowed[type]) {
      this._diag.warn(
        `disallowing ${type} because the maximum number of ${this._maxAllowed[type].toString()} has already been reached for this session`
      );

      this._incrDiagnosticCount(type, 'drop');
      return true;
    }

    this._currentCount[type] = (this._currentCount[type] || 0) + 1;
    return false;
  }

  public truncateString(type: LengthLimitedType, body: string) {
    if (body.length > this._maxLength[type]) {
      this._diag.warn(
        `truncating ${type} because it is longer than ${this._maxLength[type].toString()} characters: "${body}"`
      );

      this._incrDiagnosticCount(type, 'truncate_string');
      return body.substring(0, this._maxLength[type]);
    }

    return body;
  }

  private _truncateAttributes(
    type: AttributeLimitedType,
    attributes: Record<string, AttributeValue | undefined>,
    keyType: LengthLimitedType,
    valueType: LengthLimitedType
  ) {
    const keys = Object.keys(attributes);

    if (keys.length > this._maxAttributes[type]) {
      this._diag.warn(
        `truncating ${type} attributes because there are more than ${this._maxAttributes[type].toString()} set`
      );
      this._incrDiagnosticCount(type, 'truncate_attributes');
    }

    const truncatedAttributes: Record<string, AttributeValue | undefined> = {};

    for (let i = 0; i < Math.min(keys.length, this._maxAttributes[type]); i++) {
      const truncatedKey = this.truncateString(keyType, keys[i]);
      truncatedAttributes[truncatedKey] = this.truncateString(
        valueType,
        attributes[keys[i]]?.toString() || ''
      );
    }

    return truncatedAttributes;
  }

  public limitBreadcrumb(name: string): LimitedBreadcrumb | 'dropped' {
    if (this._dropIfMaxReached('breadcrumb')) {
      return 'dropped';
    }

    return {
      name: this.truncateString('breadcrumb', name),
    };
  }

  public limitException(
    message: string,
    attributes: Record<string, AttributeValue | undefined>
  ): LimitedException | 'dropped' {
    if (this._dropIfMaxReached('exception')) {
      return 'dropped';
    }

    return {
      message: this.truncateString('exception', message),
      attributes: this._truncateAttributes(
        'exception',
        attributes,
        'exception_attribute_key',
        'exception_attribute_value'
      ),
    };
  }

  public limitLog(
    message: string,
    severity: LogSeverity,
    attributes: Record<string, AttributeValue | undefined>
  ): LimitedLog | 'dropped' {
    const logType = LogSeverityToLimitType[severity];

    if (this._dropIfMaxReached(logType)) {
      return 'dropped';
    }

    return {
      message: this.truncateString(logType, message),
      attributes: this._truncateAttributes(
        logType,
        attributes,
        'log_attribute_key',
        'log_attribute_value'
      ),
    };
  }

  public limitSessionProperty(
    key: string,
    value: string
  ): LimitedSessionProperty | 'dropped' {
    if (this._dropIfMaxReached('session_property')) {
      return 'dropped';
    }

    return {
      key: this.truncateString('session_property_key', key),
      value: this.truncateString('session_property_value', value),
    };
  }

  public dropReadableSpan(span: ReadableSpan): boolean {
    const type =
      span.attributes[KEY_EMB_TYPE] === EMB_TYPES.Network
        ? 'network_request'
        : 'span';

    return this._dropIfMaxReached(type);
  }

  public reset(): void {
    this._diagnosticCounts = {};
    this._currentCount = {
      exception: 0,
      error_log: 0,
      warning_log: 0,
      info_log: 0,
      breadcrumb: 0,
      session_property: 0,
      span: 0,
      network_request: 0,
    };
  }

  private _incrDiagnosticCount(type: LimitedType, operation: LimitOperation) {
    const key = `emb.app.applied_limit.${type}.${operation}.count`;

    this._diagnosticCounts[key] = (this._diagnosticCounts[key] || 0) + 1;
  }
  public getDiagnosticCounts(): Record<string, number> {
    return this._diagnosticCounts;
  }
}
