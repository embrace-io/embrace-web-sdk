import * as chai from 'chai';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import {
  InMemoryStorage,
  setupTestTraceExporter,
} from '../../testUtils/index.js';
import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { UserSpanProcessor } from './UserSpanProcessor.js';
import type { UserManager } from '../../api-users/index.js';
import { EmbraceUserManager } from '../../managers/index.js';

const { expect } = chai;

describe('UserSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let userManager: UserManager;
  let tracer: Tracer;

  before(() => {
    userManager = new EmbraceUserManager({
      storage: new InMemoryStorage(),
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
