import type { ExtendedSpan, ExtendedSpanOptions } from '../api/index.js';
import type { Context } from '@opentelemetry/api';

export interface TraceManager {
  startSpan: (
    name: string,
    options?: ExtendedSpanOptions,
    context?: Context
  ) => ExtendedSpan;

  setSpan: (context: Context, span: ExtendedSpan) => Context;

  getSpan: (context: Context) => ExtendedSpan | undefined;
}
