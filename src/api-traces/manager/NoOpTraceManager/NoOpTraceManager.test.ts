import type { Span } from '@opentelemetry/api';
import { expect } from 'chai';
import { NoOpTraceManager } from './NoOpTraceManager.js';

describe('NoOpTraceManager', () => {
  let noOpTraceManager: NoOpTraceManager;

  beforeEach(() => {
    noOpTraceManager = new NoOpTraceManager();
  });

  it('should return null for startSpan', () => {
    const span: Span | null =
      noOpTraceManager.startPerformanceSpan('span-name');
    void expect(span).to.be.null;
  });
});
