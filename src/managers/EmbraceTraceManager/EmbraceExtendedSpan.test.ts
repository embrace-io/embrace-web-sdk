import type {
  Attributes,
  Link,
  Span,
  SpanContext,
  SpanStatus,
} from '@opentelemetry/api';
import { SpanStatusCode, TraceFlags } from '@opentelemetry/api';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { KEY_EMB_ERROR_CODE } from '../../constants/index.ts';
import { EmbraceExtendedSpan } from './EmbraceExtendedSpan.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceExtendedSpan', () => {
  let mockSpan: Span & { attributes: Attributes };
  let extendedSpan: EmbraceExtendedSpan;

  beforeEach(() => {
    mockSpan = {
      attributes: { existing: 'attr' },
      addEvent: sinon.stub().returnsThis(),
      addLink: sinon.stub().returnsThis(),
      addLinks: sinon.stub().returnsThis(),
      end: sinon.stub(),
      isRecording: sinon.stub().returns(true),
      recordException: sinon.stub(),
      setAttribute: sinon.stub().returnsThis(),
      setAttributes: sinon.stub().returnsThis(),
      setStatus: sinon.stub().returnsThis(),
      spanContext: sinon.stub().returns({
        traceId: 'trace123',
        spanId: 'span456',
        traceFlags: TraceFlags.SAMPLED,
      } as SpanContext),
      updateName: sinon.stub().returnsThis(),
    } as unknown as Span & { attributes: Attributes };

    extendedSpan = new EmbraceExtendedSpan(mockSpan);
  });

  describe('constructor', () => {
    it('should wrap the provided span', () => {
      expect(extendedSpan.attributes).to.deep.equal({ existing: 'attr' });
    });
  });

  describe('attributes getter', () => {
    it('should return delegated span attributes', () => {
      mockSpan.attributes = { test: 'value', another: 123 };
      expect(extendedSpan.attributes).to.deep.equal({
        test: 'value',
        another: 123,
      });
    });
  });

  describe('addEvent', () => {
    it('should delegate to underlying span', () => {
      extendedSpan.addEvent('eventName');
      expect(mockSpan.addEvent).to.have.been.calledOnceWith('eventName');
    });

    it('should pass attributes to underlying span', () => {
      const attrs: Attributes = { key: 'value' };
      extendedSpan.addEvent('eventName', attrs);
      expect(mockSpan.addEvent).to.have.been.calledOnceWith('eventName', attrs);
    });

    it('should pass startTime to underlying span', () => {
      const attrs: Attributes = { key: 'value' };
      extendedSpan.addEvent('eventName', attrs, 12345);
      expect(mockSpan.addEvent).to.have.been.calledOnceWith(
        'eventName',
        attrs,
        12345,
      );
    });

    it('should return this for chaining', () => {
      const result = extendedSpan.addEvent('eventName');
      expect(result).to.equal(extendedSpan);
    });
  });

  describe('addLink', () => {
    it('should delegate to underlying span', () => {
      const link: Link = {
        context: {
          traceId: 'linked-trace',
          spanId: 'linked-span',
          traceFlags: TraceFlags.SAMPLED,
        },
      };
      extendedSpan.addLink(link);
      expect(mockSpan.addLink).to.have.been.calledOnceWith(link);
    });

    it('should return this for chaining', () => {
      const link: Link = {
        context: {
          traceId: 'linked-trace',
          spanId: 'linked-span',
          traceFlags: TraceFlags.SAMPLED,
        },
      };
      const result = extendedSpan.addLink(link);
      expect(result).to.equal(extendedSpan);
    });
  });

  describe('addLinks', () => {
    it('should delegate to underlying span', () => {
      const links: Link[] = [
        {
          context: {
            traceId: 'trace1',
            spanId: 'span1',
            traceFlags: TraceFlags.SAMPLED,
          },
        },
        {
          context: {
            traceId: 'trace2',
            spanId: 'span2',
            traceFlags: TraceFlags.SAMPLED,
          },
        },
      ];
      extendedSpan.addLinks(links);
      expect(mockSpan.addLinks).to.have.been.calledOnceWith(links);
    });

    it('should return this for chaining', () => {
      const result = extendedSpan.addLinks([]);
      expect(result).to.equal(extendedSpan);
    });
  });

  describe('end', () => {
    it('should delegate to underlying span without endTime', () => {
      extendedSpan.end();
      expect(mockSpan.end).to.have.been.calledOnceWith(undefined);
    });

    it('should delegate with endTime', () => {
      extendedSpan.end(12345);
      expect(mockSpan.end).to.have.been.calledOnceWith(12345);
    });
  });

  describe('isRecording', () => {
    it('should delegate to underlying span', () => {
      expect(extendedSpan.isRecording()).to.be.true;
      expect(mockSpan.isRecording).to.have.been.calledOnce;
    });

    it('should return false when span is not recording', () => {
      (mockSpan.isRecording as sinon.SinonStub).returns(false);
      expect(extendedSpan.isRecording()).to.be.false;
    });
  });

  describe('recordException', () => {
    it('should delegate to underlying span', () => {
      const error = new Error('test error');
      extendedSpan.recordException(error);
      expect(mockSpan.recordException).to.have.been.calledOnceWith(
        error,
        undefined,
      );
    });

    it('should delegate with time', () => {
      const error = new Error('test error');
      extendedSpan.recordException(error, 12345);
      expect(mockSpan.recordException).to.have.been.calledOnceWith(
        error,
        12345,
      );
    });
  });

  describe('setAttribute', () => {
    it('should delegate to underlying span', () => {
      extendedSpan.setAttribute('key', 'value');
      expect(mockSpan.setAttribute).to.have.been.calledOnceWith('key', 'value');
    });

    it('should return this for chaining', () => {
      const result = extendedSpan.setAttribute('key', 'value');
      expect(result).to.equal(extendedSpan);
    });
  });

  describe('setAttributes', () => {
    it('should delegate to underlying span', () => {
      const attrs: Attributes = { key1: 'value1', key2: 'value2' };
      extendedSpan.setAttributes(attrs);
      expect(mockSpan.setAttributes).to.have.been.calledOnceWith(attrs);
    });

    it('should return this for chaining', () => {
      const result = extendedSpan.setAttributes({});
      expect(result).to.equal(extendedSpan);
    });
  });

  describe('removeAttribute', () => {
    it('should remove attribute from span', () => {
      mockSpan.attributes = { key1: 'value1', key2: 'value2' };
      extendedSpan.removeAttribute('key1');
      expect(mockSpan.attributes).to.deep.equal({ key2: 'value2' });
    });

    it('should return this for chaining', () => {
      const result = extendedSpan.removeAttribute('nonexistent');
      expect(result).to.equal(extendedSpan);
    });

    it('should handle removing non-existent attribute', () => {
      mockSpan.attributes = { existing: 'value' };
      extendedSpan.removeAttribute('nonexistent');
      expect(mockSpan.attributes).to.deep.equal({ existing: 'value' });
    });
  });

  describe('setStatus', () => {
    it('should delegate to underlying span', () => {
      const status: SpanStatus = { code: SpanStatusCode.ERROR };
      extendedSpan.setStatus(status);
      expect(mockSpan.setStatus).to.have.been.calledOnceWith(status);
    });

    it('should return this for chaining', () => {
      const result = extendedSpan.setStatus({ code: SpanStatusCode.OK });
      expect(result).to.equal(extendedSpan);
    });
  });

  describe('spanContext', () => {
    it('should delegate to underlying span', () => {
      const context = extendedSpan.spanContext();
      expect(context.traceId).to.equal('trace123');
      expect(context.spanId).to.equal('span456');
      expect(mockSpan.spanContext).to.have.been.calledOnce;
    });
  });

  describe('updateName', () => {
    it('should delegate to underlying span', () => {
      extendedSpan.updateName('newName');
      expect(mockSpan.updateName).to.have.been.calledOnceWith('newName');
    });

    it('should return this for chaining', () => {
      const result = extendedSpan.updateName('newName');
      expect(result).to.equal(extendedSpan);
    });
  });

  describe('fail', () => {
    it('should set error code attribute and end span', () => {
      extendedSpan.fail({ code: 'failure' });
      expect(mockSpan.setAttribute).to.have.been.calledOnceWith(
        KEY_EMB_ERROR_CODE,
        'FAILURE',
      );
      expect(mockSpan.end).to.have.been.calledOnce;
    });

    it('should use default code "failure" when no options provided', () => {
      extendedSpan.fail();
      expect(mockSpan.setAttribute).to.have.been.calledOnceWith(
        KEY_EMB_ERROR_CODE,
        'FAILURE',
      );
      expect(mockSpan.end).to.have.been.calledOnce;
    });

    it('should use provided endTime', () => {
      extendedSpan.fail({ code: 'failure', endTime: 12345 });
      expect(mockSpan.end).to.have.been.calledOnceWith(12345);
    });

    it('should uppercase the user_abandon code', () => {
      extendedSpan.fail({ code: 'user_abandon' });
      expect(mockSpan.setAttribute).to.have.been.calledWith(
        KEY_EMB_ERROR_CODE,
        'USER_ABANDON',
      );
    });

    it('should not set attribute when code is undefined', () => {
      extendedSpan.fail({ code: undefined });
      expect(mockSpan.setAttribute).to.not.have.been.called;
      expect(mockSpan.end).to.have.been.calledOnce;
    });
  });
});
