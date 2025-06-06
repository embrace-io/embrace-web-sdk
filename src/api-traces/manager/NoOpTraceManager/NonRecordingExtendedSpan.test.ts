import * as chai from 'chai';
import { NonRecordingExtendedSpan } from './NonRecordingExtendedSpan.js';
import { INVALID_SPAN_CONTEXT } from '@opentelemetry/api';

const { expect } = chai;

describe('NonRecordingExtendedSpan', () => {
  it('should create a no-op extended span', () => {
    const nonRecordingSpan = new NonRecordingExtendedSpan();

    void expect(nonRecordingSpan.spanContext()).to.be.deep.equal(
      INVALID_SPAN_CONTEXT
    );
    void expect(nonRecordingSpan.isRecording()).to.be.false;

    // Check that all methods can be called and do not throw errors
    void expect(() => {
      nonRecordingSpan.fail();
      nonRecordingSpan.setAttribute('key', 'value');
      nonRecordingSpan.setAttributes({ key: 'value' });
      nonRecordingSpan.addEvent('event');
      nonRecordingSpan.addLink({ context: INVALID_SPAN_CONTEXT });
      nonRecordingSpan.addLinks([{ context: INVALID_SPAN_CONTEXT }]);
      nonRecordingSpan.setStatus({ code: 0 });
      nonRecordingSpan.updateName('newName');
      nonRecordingSpan.end();
      nonRecordingSpan.recordException(new Error('test error'));
    }).to.not.throw();
  });
});
