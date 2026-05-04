import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { setupTestTraceExporter } from '../../../tests/utils/index.ts';
import { NoOpUserSessionManager } from '../../api-sessions/manager/NoOpUserSessionManager/index.ts';
import type { UserSessionManagerInternal } from '../../managers/EmbraceUserSessionManager/index.ts';
import { IdentifiableSessionPartSpanProcessor } from './IdentifiableSessionPartSpanProcessor.ts';

const { expect } = chai;

// Minimal stub: the processor only reads getSessionPartId(). Going through
// EmbraceUserSessionManager would pull in tracer state that fights with the
// global WebTracerProvider set up for this test.
const createStubUserSessionManager = (): UserSessionManagerInternal & {
  setId: (id: string | null) => void;
} => {
  let id: string | null = null;
  const base = new NoOpUserSessionManager();
  return Object.assign(base, {
    setId: (v: string | null) => {
      id = v;
    },
    getSessionPartId: () => id,
  });
};

describe('IdentifiableSessionPartSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let userSessionManager: ReturnType<typeof createStubUserSessionManager>;
  let tracer: Tracer;

  before(() => {
    userSessionManager = createStubUserSessionManager();
    memoryExporter = setupTestTraceExporter([
      new IdentifiableSessionPartSpanProcessor({
        userSessionManager,
      }),
    ]);
    tracer = trace.getTracer('test-tracer');
  });

  beforeEach(() => {
    memoryExporter.reset();
    userSessionManager.setId(null);
  });

  it('should stamp emb.session_part_id on spans started while a part is active', () => {
    userSessionManager.setId('PART-1');

    const span = tracer.startSpan('child');
    span.end();

    const finished = memoryExporter.getFinishedSpans();
    expect(finished).to.have.lengthOf(1);
    expect(finished[0].attributes['emb.session_part_id']).to.equal('PART-1');
  });

  it('should stamp an empty emb.session_part_id on spans started without an active part', () => {
    const span = tracer.startSpan('child');
    span.end();

    const finished = memoryExporter.getFinishedSpans();
    expect(finished).to.have.lengthOf(1);
    expect(finished[0].attributes['emb.session_part_id']).to.equal('');
  });

  it('should capture the part ID at onStart even if the active part changes before the span ends', () => {
    userSessionManager.setId('PART-1');

    const span = tracer.startSpan('child');
    userSessionManager.setId('PART-2');
    span.end();

    const finished = memoryExporter.getFinishedSpans();
    expect(finished).to.have.lengthOf(1);
    expect(finished[0].attributes['emb.session_part_id']).to.equal('PART-1');
  });
});
