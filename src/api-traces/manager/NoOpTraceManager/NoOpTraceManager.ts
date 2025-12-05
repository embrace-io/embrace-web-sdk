import type { Context } from '@opentelemetry/api';
import { ROOT_CONTEXT } from '@opentelemetry/api';
import type { ExtendedSpan, ExtendedSpanOptions } from '../../api/index.ts';
import type { TraceManager } from '../index.ts';
import { NonRecordingExtendedSpan } from './NonRecordingExtendedSpan.ts';

export class NoOpTraceManager implements TraceManager {
  public startSpan(
    _name: string,
    _options?: ExtendedSpanOptions,
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
