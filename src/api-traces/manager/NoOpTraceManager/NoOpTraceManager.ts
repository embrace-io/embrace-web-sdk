import type { TraceManager } from '../index.js';
import type { ExtendedSpan, ExtendedSpanOptions } from '../../api/index.js';
import { NonRecordingExtendedSpan } from './NonRecordingExtendedSpan.js';
import type { Context } from '@opentelemetry/api';
import { ROOT_CONTEXT } from '@opentelemetry/api';

export class NoOpTraceManager implements TraceManager {
  public startSpan(
    _name: string,
    _options?: ExtendedSpanOptions
  ): ExtendedSpan {
    return new NonRecordingExtendedSpan();
  }

  public setSpan(_context: Context, _span: ExtendedSpan): Context {
    return ROOT_CONTEXT;
  }

  public getSpan(_context: Context): ExtendedSpan | undefined {
    return undefined;
  }
}
