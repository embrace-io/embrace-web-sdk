import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import {
  InMemoryDiagLogger,
  InMemoryStorage,
  setupTestTraceExporter,
} from '../../../tests/utils/index.ts';
import type { UserManager } from '../../api-users/index.ts';
import { EmbraceUserManager } from '../../managers/index.ts';
import { EmbraceStorage } from '../../utils/EmbraceStorage/EmbraceStorage.ts';
import { UserSpanProcessor } from './UserSpanProcessor.ts';

const { expect } = chai;

describe('UserSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let userManager: UserManager;
  let tracer: Tracer;

  before(() => {
    userManager = new EmbraceUserManager({
      storage: new EmbraceStorage(
        new InMemoryStorage(),
        new InMemoryDiagLogger(),
      ),
    });

    memoryExporter = setupTestTraceExporter([
      new UserSpanProcessor({ userManager }),
    ]);
    tracer = trace.getTracer('test-tracer');
  });

  afterEach(() => {
    memoryExporter.reset();
    userManager.clearUserId();
  });

  it('should set userId attribute on spans when userId is set', () => {
    const span = tracer.startSpan('test-span');

    userManager.setUserId('test-user-id');

    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const readableSpan = finishedSpans[0];
    expect(readableSpan.attributes).to.have.property('user.id', 'test-user-id');
  });
});
