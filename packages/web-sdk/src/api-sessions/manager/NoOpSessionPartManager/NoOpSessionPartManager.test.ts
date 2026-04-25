import type { HrTime, Span } from '@opentelemetry/api';
import { expect } from 'chai';
import { NoOpSessionPartManager } from './NoOpSessionPartManager.ts';

describe('NoOpSessionPartManager', () => {
  let noOpSessionPartManager: NoOpSessionPartManager;

  beforeEach(() => {
    noOpSessionPartManager = new NoOpSessionPartManager();
  });

  it('should return null for getSessionId', () => {
    const sessionId = noOpSessionPartManager.getSessionPartId();
    void expect(sessionId).to.be.null;
  });

  it('should return null for getPreviousSessionId', () => {
    const sessionId = noOpSessionPartManager.getPreviousSessionPartId();
    void expect(sessionId).to.be.null;
  });

  it('should return null for getSessionSpan', () => {
    const sessionPartSpan: Span | null =
      noOpSessionPartManager.getSessionPartSpan();
    void expect(sessionPartSpan).to.be.null;
  });

  it('should return null for getSessionStartTime', () => {
    const sessionStartTime: HrTime | null =
      noOpSessionPartManager.getSessionPartStartTime();
    void expect(sessionStartTime).to.be.null;
  });

  it('should do nothing for startSessionPart', () => {
    expect(() => {
      noOpSessionPartManager.startSessionPart();
    }).to.not.throw();
  });

  it('should do nothing for endSessionPart', () => {
    expect(() => {
      noOpSessionPartManager.endSessionPart();
    }).to.not.throw();
  });

  it('should do nothing for endSessionPartInternal', () => {
    expect(() => {
      noOpSessionPartManager.endSessionPartInternal('manual');
    }).to.not.throw();
  });

  it('should do nothing for addBreadcrumb', () => {
    expect(() => {
      noOpSessionPartManager.addBreadcrumb('name');
    }).to.not.throw();
  });

  it('should do nothing for addProperty', () => {
    expect(() => {
      noOpSessionPartManager.addProperty(
        'some-custom-key',
        'some custom value',
      );
    }).to.not.throw();
  });

  it('should do nothing for removeProperty', () => {
    expect(() => {
      noOpSessionPartManager.removeProperty('some-custom-key');
    }).to.not.throw();
  });

  it('should do nothing for addSessionPartStartedListener', () => {
    expect(() => {
      noOpSessionPartManager.addSessionPartStartedListener(() => {});
    }).to.not.throw();
  });

  it('should do nothing for addSessionPartEndedListener', () => {
    expect(() => {
      noOpSessionPartManager.addSessionPartEndedListener(() => {});
    }).to.not.throw();
  });
});
