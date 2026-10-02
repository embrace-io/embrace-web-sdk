import { context, diag, trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { log } from '../api-logs/index.ts';
import { initSDK } from './initSDK.ts';
import { registry } from './registry.ts';

const { expect } = chai;

const PROBE_BODY = 'batch-window-probe';

/**
 * The end-to-end request assertions depend on this window: page-load telemetry
 * and a later interaction only share a request while both fall inside it.
 * Chromium 149 to 151 shifted page-load timing across the boundary and broke
 * those tests, so it is pinned here where a fake clock can assert it exactly
 * rather than inferred from wall-clock racing in a browser.
 *
 * This lives in its own file because @web/test-runner isolates each file in a
 * fresh page. Sharing a file with other initSDK tests lets an SDK built by an
 * earlier test keep timers registered, which the fake clock then fires.
 */
describe('log export schedule', () => {
  let logExporter: InMemoryLogRecordExporter;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    logExporter = new InMemoryLogRecordExporter();
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
    logExporter.reset();
    trace.disable();
    logs.disable();
    diag.disable();
    context.disable();
    registry.clear();
  });

  // Instrumentations emit logs of their own, so count only this probe.
  const probeCount = () =>
    logExporter
      .getFinishedLogRecords()
      .filter((record) => record.body === PROBE_BODY).length;

  it('should hold a log in the batch buffer until the scheduled delay elapses', async () => {
    const result = initSDK({
      logExporters: [logExporter],
      // Reads navigation timing entries that a fake clock leaves undefined.
      defaultInstrumentationConfig: { omit: new Set(['document-load']) },
    });
    void expect(result).not.to.be.false;

    log.message(PROBE_BODY, 'info');

    await clock.tickAsync(999);
    expect(probeCount()).to.equal(0);

    await clock.tickAsync(2);
    expect(probeCount()).to.equal(1);
  });

  it('should export immediately when flushed instead of waiting for the delay', async () => {
    const result = initSDK({
      logExporters: [logExporter],
      defaultInstrumentationConfig: { omit: new Set(['document-load']) },
    });
    void expect(result).not.to.be.false;

    log.message(PROBE_BODY, 'info');

    await log.flush();

    expect(probeCount()).to.equal(1);
  });
});
