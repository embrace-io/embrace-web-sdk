import type { Span } from '@opentelemetry/api';
import { PerformanceTimingNames } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { EventNames } from './enums/EventNames.ts';
import {
  addSpanPerformancePaintEvents,
  getPerformanceNavigationEntries,
} from './utils.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('document-load/utils', () => {
  describe('getPerformanceNavigationEntries', () => {
    let getEntriesByTypeStub: sinon.SinonStub;

    beforeEach(() => {
      getEntriesByTypeStub = sinon.stub(window.performance, 'getEntriesByType');
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should return numeric timing values', () => {
      const mockEntry = {
        [PerformanceTimingNames.CONNECT_START]: 100,
        [PerformanceTimingNames.CONNECT_END]: 200,
        [PerformanceTimingNames.DOM_COMPLETE]: 1000,
      };
      getEntriesByTypeStub.withArgs('navigation').returns([mockEntry]);

      const result = getPerformanceNavigationEntries();

      expect(result[PerformanceTimingNames.CONNECT_START]).to.equal(100);
      expect(result[PerformanceTimingNames.CONNECT_END]).to.equal(200);
      expect(result[PerformanceTimingNames.DOM_COMPLETE]).to.equal(1000);
    });

    it('should filter non-numeric values', () => {
      const mockEntry = {
        [PerformanceTimingNames.CONNECT_START]: 100,
        [PerformanceTimingNames.CONNECT_END]: 'not-a-number',
        [PerformanceTimingNames.DOM_COMPLETE]: null,
      };
      getEntriesByTypeStub.withArgs('navigation').returns([mockEntry]);

      const result = getPerformanceNavigationEntries();

      expect(result[PerformanceTimingNames.CONNECT_START]).to.equal(100);
      expect(result).to.not.have.property(PerformanceTimingNames.CONNECT_END);
      expect(result).to.not.have.property(PerformanceTimingNames.DOM_COMPLETE);
    });

    it('should handle missing entries gracefully', () => {
      const mockEntry = {
        [PerformanceTimingNames.CONNECT_START]: 100,
        // Other entries are missing
      };
      getEntriesByTypeStub.withArgs('navigation').returns([mockEntry]);

      const result = getPerformanceNavigationEntries();

      expect(result[PerformanceTimingNames.CONNECT_START]).to.equal(100);
      // Should not throw and return only available entries
      expect(Object.keys(result).length).to.be.greaterThanOrEqual(1);
    });

    it('should handle empty navigation entry', () => {
      getEntriesByTypeStub.withArgs('navigation').returns([{}]);

      const result = getPerformanceNavigationEntries();

      expect(Object.keys(result).length).to.equal(0);
    });
  });

  describe('addSpanPerformancePaintEvents', () => {
    let mockSpan: Span;
    let getEntriesByTypeStub: sinon.SinonStub;

    beforeEach(() => {
      mockSpan = {
        addEvent: sinon.stub(),
      } as unknown as Span;

      getEntriesByTypeStub = sinon.stub(window.performance, 'getEntriesByType');
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should add paint events to span', () => {
      getEntriesByTypeStub.withArgs('paint').returns([
        { name: 'first-paint', startTime: 100 },
        { name: 'first-contentful-paint', startTime: 200 },
      ]);

      addSpanPerformancePaintEvents(mockSpan);

      expect(mockSpan.addEvent).to.have.been.calledTwice;
      expect(mockSpan.addEvent).to.have.been.calledWith(
        EventNames.FIRST_PAINT,
        100,
      );
      expect(mockSpan.addEvent).to.have.been.calledWith(
        EventNames.FIRST_CONTENTFUL_PAINT,
        200,
      );
    });

    it('should ignore unknown paint types', () => {
      getEntriesByTypeStub.withArgs('paint').returns([
        { name: 'first-paint', startTime: 100 },
        { name: 'unknown-paint-type', startTime: 150 },
        { name: 'first-contentful-paint', startTime: 200 },
      ]);

      addSpanPerformancePaintEvents(mockSpan);

      expect(mockSpan.addEvent).to.have.been.calledTwice;
      expect(mockSpan.addEvent).to.have.been.calledWith(
        EventNames.FIRST_PAINT,
        100,
      );
      expect(mockSpan.addEvent).to.have.been.calledWith(
        EventNames.FIRST_CONTENTFUL_PAINT,
        200,
      );
    });

    it('should handle no paint entries', () => {
      getEntriesByTypeStub.withArgs('paint').returns([]);

      addSpanPerformancePaintEvents(mockSpan);

      expect(mockSpan.addEvent).to.not.have.been.called;
    });

    it('should handle only first-paint entry', () => {
      getEntriesByTypeStub
        .withArgs('paint')
        .returns([{ name: 'first-paint', startTime: 100 }]);

      addSpanPerformancePaintEvents(mockSpan);

      expect(mockSpan.addEvent).to.have.been.calledOnce;
      expect(mockSpan.addEvent).to.have.been.calledWith(
        EventNames.FIRST_PAINT,
        100,
      );
    });

    it('should handle only first-contentful-paint entry', () => {
      getEntriesByTypeStub
        .withArgs('paint')
        .returns([{ name: 'first-contentful-paint', startTime: 200 }]);

      addSpanPerformancePaintEvents(mockSpan);

      expect(mockSpan.addEvent).to.have.been.calledOnce;
      expect(mockSpan.addEvent).to.have.been.calledWith(
        EventNames.FIRST_CONTENTFUL_PAINT,
        200,
      );
    });
  });
});
