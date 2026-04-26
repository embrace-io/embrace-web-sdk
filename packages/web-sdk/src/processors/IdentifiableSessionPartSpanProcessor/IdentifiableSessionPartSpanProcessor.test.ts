import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { setupTestTraceExporter } from '../../../tests/utils/index.ts';
import type { SessionPartManager } from '../../api-sessions/index.ts';
import { IdentifiableSessionPartSpanProcessor } from './IdentifiableSessionPartSpanProcessor.ts';

const { expect } = chai;

// Minimal stub: the processor only reads getSessionPartId(). Going through
// EmbraceSessionPartManager would pull in tracer state that fights with the
// global WebTracerProvider set up for this test.
const createStubPartManager = (): SessionPartManager & {
  setId: (id: string | null) => void;
} => {
  let id: string | null = null;
  const noop = () => {};
  return {
    setId: (v) => {
      id = v;
    },
    getSessionPartId: () => id,
    getPreviousSessionPartId: () => null,
    getSessionPartStartTime: () => null,
    getSessionPartSpan: () => null,
    startSessionPart: noop,
    endSessionPart: noop,
    addBreadcrumb: noop,
    addProperty: noop,
    removeProperty: noop,
    endSessionPartInternal: noop,
    incrSessionPartCountForKey: noop,
    incrNextSessionPartCountForKey: noop,
    addSessionPartStartedListener: () => () => {},
    addSessionPartEndedListener: () => () => {},
  };
};

describe('IdentifiableSessionPartSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let sessionPartManager: ReturnType<typeof createStubPartManager>;
  let tracer: Tracer;

  before(() => {
    sessionPartManager = createStubPartManager();
    memoryExporter = setupTestTraceExporter([
      new IdentifiableSessionPartSpanProcessor({
        sessionPartManager,
      }),
    ]);
    tracer = trace.getTracer('test-tracer');
  });

  beforeEach(() => {
    memoryExporter.reset();
    sessionPartManager.setId(null);
  });

  it('should stamp emb.session_part_id on spans started while a part is active', () => {
    sessionPartManager.setId('PART-1');

    const span = tracer.startSpan('child');
    span.end();

    const finished = memoryExporter.getFinishedSpans();
    expect(finished).to.have.lengthOf(1);
    expect(finished[0].attributes['emb.session_part_id']).to.equal('PART-1');
  });

  it('should leave emb.session_part_id unset on spans started without an active part', () => {
    const span = tracer.startSpan('child');
    span.end();

    const finished = memoryExporter.getFinishedSpans();
    expect(finished).to.have.lengthOf(1);
    void expect(finished[0].attributes['emb.session_part_id']).to.be.undefined;
  });

  it('should capture the part ID at onStart even if the active part changes before the span ends', () => {
    sessionPartManager.setId('PART-1');

    const span = tracer.startSpan('child');
    sessionPartManager.setId('PART-2');
    span.end();

    const finished = memoryExporter.getFinishedSpans();
    expect(finished).to.have.lengthOf(1);
    expect(finished[0].attributes['emb.session_part_id']).to.equal('PART-1');
  });
});
