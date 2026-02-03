import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { OTLPFetchLogExporter } from './OTLPFetchLogExporter.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('OTLPFetchLogExporter', () => {
  const defaultConfig = {
    url: 'https://test.example.com/v2/logs',
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

      const exporter = new OTLPFetchLogExporter(config);

      expect(exporter).to.be.instanceOf(OTLPFetchLogExporter);
    });

    it('should implement LogRecordExporter interface', () => {
      const exporter = new OTLPFetchLogExporter(defaultConfig);

      // LogRecordExporter interface methods
      expect(exporter.export).to.be.a('function');
      expect(exporter.shutdown).to.be.a('function');
    });

    it('should handle config with all required fields', () => {
      const exporter = new OTLPFetchLogExporter(defaultConfig);

      expect(exporter).to.be.instanceOf(OTLPFetchLogExporter);
    });
  });
});
