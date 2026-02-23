import type { Context } from '@opentelemetry/api';
import { ROOT_CONTEXT } from '@opentelemetry/api';
import { expect } from 'chai';
import { NonRecordingExtendedSpan } from './NonRecordingExtendedSpan.ts';
import { NoOpTraceManager } from './NoOpTraceManager.ts';

describe('NoOpTraceManager', () => {
  let noOpTraceManager: NoOpTraceManager;

  beforeEach(() => {
    noOpTraceManager = new NoOpTraceManager();
  });

  it('should return a non recording span for startSpan', () => {
    const nonRecordingSpan = noOpTraceManager.startSpan('span-name');
    void expect(nonRecordingSpan).to.be.instanceOf(NonRecordingExtendedSpan);
  });

  it('should return ROOT_CONTEXT for setSpan', () => {
    const context = noOpTraceManager.setSpan(
      {} as Context,
      new NonRecordingExtendedSpan(),
    );
    void expect(context).to.deep.equal(ROOT_CONTEXT);
  });

  it('should return undefined for getSpan', () => {
    const span = noOpTraceManager.getSpan({} as Context);
    void expect(span).to.be.undefined;
  });
});
