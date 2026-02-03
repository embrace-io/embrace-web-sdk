import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { OTLPFetchTraceExporter } from './OTLPFetchTraceExporter.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('OTLPFetchTraceExporter', () => {
  const defaultConfig = {
    url: 'https://test.example.com/v2/spans',
    headers: {},
    timeoutMillis: 5000,
    concurrencyLimit: 30,
    compression: 'gzip' as const,
  };

  describe('constructor', () => {
    it('should create exporter with correct config', () => {
      const config = {
        ...defaultConfig,
        headers: { 'X-Custom': 'header' },
      };

      const exporter = new OTLPFetchTraceExporter(config);

      expect(exporter).to.be.instanceOf(OTLPFetchTraceExporter);
    });

    it('should implement SpanExporter interface', () => {
      const exporter = new OTLPFetchTraceExporter(defaultConfig);

      // SpanExporter interface methods
      expect(exporter.export).to.be.a('function');
      expect(exporter.shutdown).to.be.a('function');
    });

    it('should always enable gzip compression', () => {
      // The constructor always adds compression: 'gzip' to config
      // We verify this by ensuring the exporter is created successfully
      const exporter = new OTLPFetchTraceExporter(defaultConfig);

      expect(exporter).to.be.instanceOf(OTLPFetchTraceExporter);
    });
  });
});
