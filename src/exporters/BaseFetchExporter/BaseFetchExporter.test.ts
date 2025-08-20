import type { IOtlpExportDelegate } from '@opentelemetry/otlp-exporter-base';
import * as chai from 'chai';
import { expect } from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { BaseFetchExporter } from './BaseFetchExporter.js';

chai.use(sinonChai);

describe('BaseFetchExporter', () => {
  let delegate: IOtlpExportDelegate<unknown>;
  let exporter: BaseFetchExporter<unknown>;

  beforeEach(() => {
    delegate = {
      export: sinon.stub(),
      forceFlush: sinon.stub().resolves(),
      shutdown: sinon.stub().resolves(),
    };
    exporter = new BaseFetchExporter(delegate);
  });

  it('should call delegate.export with correct arguments', () => {
    const items: unknown[] = [];
    const resultCallback = sinon.stub();
    exporter.export(items, resultCallback);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(delegate.export).to.have.been.calledOnceWith(items, resultCallback);
  });

  it('should call delegate.forceFlush and return a promise', async () => {
    await exporter.forceFlush();
     
    void expect(delegate.forceFlush.calledOnce).to.be.true;
  });

  it('should call delegate.shutdown and return a promise', async () => {
    await exporter.shutdown();
     
    void expect(delegate.shutdown.calledOnce).to.be.true;
  });
});
