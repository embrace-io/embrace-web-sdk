import type { PerformanceManager } from '../../../utils/index.js';
import { OTelPerformanceManager } from '../../../utils/index.js';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import type { GlobalExceptionInstrumentationArgs } from './types.js';
import { SeverityNumber } from '@opentelemetry/api-logs';
import type { AttributeValue } from '@opentelemetry/api';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.js';
import { KEY_EMB_EXCEPTION_HANDLING } from '../../../constants/attributes.js';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';

export class GlobalExceptionInstrumentation extends InstrumentationBase {
  private readonly _onErrorHandler: (event: ErrorEvent) => void;
  private readonly _perf: PerformanceManager;
  private readonly _onUnhandledRejectionHandler: (
    event: PromiseRejectionEvent
  ) => void;

  public constructor({
    perf = new OTelPerformanceManager(),
  }: GlobalExceptionInstrumentationArgs = {}) {
    super('GlobalExceptionInstrumentation', '1.0.0', {});
    this._perf = perf;
    this._onErrorHandler = (event: ErrorEvent) => {
      this._logException({
        timestamp: this._perf.epochMillisFromOriginOffset(event.timeStamp),
        error: event.error as Error,
        handled: false,
      });
    };
    this._onUnhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      let error: Error;
      if (event.reason && event.reason instanceof Error) {
        error = event.reason;
      } else {
        error = new Error(
          typeof event.reason === 'string'
            ? event.reason
            : 'Unhandled Rejected Promise'
        );
        error.stack = '';
      }

      this._logException({
        timestamp: this._perf.epochMillisFromOriginOffset(event.timeStamp),
        error,
        handled: false,
      });
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  private _logException({
    timestamp,
    error,
    handled,
    attributes = {},
  }: {
    timestamp: number;
    error: Error;
    handled: boolean;
    attributes?: Record<string, AttributeValue | undefined>;
  }) {
    this.logger.emit({
      timestamp,
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: error.message || '',
      attributes: {
        ...attributes,
        [KEY_EMB_TYPE]: EMB_TYPES.SystemException,
        [KEY_EMB_EXCEPTION_HANDLING]: handled ? 'HANDLED' : 'UNHANDLED',
        [ATTR_EXCEPTION_TYPE]: error.constructor.name,
        ['exception.name']: error.name,
        [ATTR_EXCEPTION_MESSAGE]: error.message,
        [ATTR_EXCEPTION_STACKTRACE]: error.stack,
      },
    });
  }

  public disable(): void {
    window.removeEventListener('error', this._onErrorHandler);
    window.removeEventListener(
      'unhandledrejection',
      this._onUnhandledRejectionHandler
    );
  }

  public enable(): void {
    window.addEventListener('error', this._onErrorHandler);
    window.addEventListener(
      'unhandledrejection',
      this._onUnhandledRejectionHandler
    );
  }
}
