import { expect } from 'chai';
import { NoOpSpanSessionManager } from './NoOpSpanSessionManager';
import type { HrTime, Span } from '@opentelemetry/api';

describe('NoOpSpanSessionManager', () => {
  let noOpSpanSessionManager: NoOpSpanSessionManager;

  beforeEach(() => {
    noOpSpanSessionManager = new NoOpSpanSessionManager();
  });

  it('should return null for getSessionId', () => {
    const sessionId = noOpSpanSessionManager.getSessionId();
    expect(sessionId).to.be.null;
  });

  it('should return null for getSessionSpan', () => {
    const sessionSpan: Span | null = noOpSpanSessionManager.getSessionSpan();
    expect(sessionSpan).to.be.null;
  });

  it('should return null for getSessionStartTime', () => {
    const sessionStartTime: HrTime | null =
      noOpSpanSessionManager.getSessionStartTime();
    expect(sessionStartTime).to.be.null;
  });

  it('should do nothing for startSessionSpan', () => {
    expect(() => noOpSpanSessionManager.startSessionSpan()).to.not.throw();
  });

  it('should do nothing for endSessionSpan', () => {
    expect(() => noOpSpanSessionManager.endSessionSpan()).to.not.throw();
  });

  it('should do nothing for endSessionSpanInternal', () => {
    expect(() =>
      noOpSpanSessionManager.endSessionSpanInternal()
    ).to.not.throw();
  });
});
