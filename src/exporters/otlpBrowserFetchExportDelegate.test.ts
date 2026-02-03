import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import {
  JsonLogsSerializer,
  JsonTraceSerializer,
} from '#embrace-io/otlp-transformer';
import { createOtlpBrowserFetchExportDelegate } from './otlpBrowserFetchExportDelegate.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('otlpBrowserFetchExportDelegate', () => {
  const defaultConfig = {
    url: 'https://test.example.com/v2/logs',
    headers: {},
    timeoutMillis: 5000,
    concurrencyLimit: 30,
    compression: 'gzip' as const,
  };

  describe('createOtlpBrowserFetchExportDelegate', () => {
    it('should create delegate with correct config for logs', () => {
      const config = {
        ...defaultConfig,
        headers: { 'X-EM-AID': 'abc12' },
      };

      const delegate = createOtlpBrowserFetchExportDelegate(
        config,
        JsonLogsSerializer,
      );

      expect(delegate).to.be.an('object');
      expect(delegate.export).to.be.a('function');
    });

    it('should create delegate with correct config for traces', () => {
      const config = {
        ...defaultConfig,
        url: 'https://test.example.com/v2/spans',
      };

      const delegate = createOtlpBrowserFetchExportDelegate(
        config,
        JsonTraceSerializer,
      );

      expect(delegate).to.be.an('object');
      expect(delegate.export).to.be.a('function');
    });

    it('should create delegate with all required config', () => {
      const delegate = createOtlpBrowserFetchExportDelegate(
        defaultConfig,
        JsonLogsSerializer,
      );

      expect(delegate).to.be.an('object');
    });

    it('should pass compression config to transport', () => {
      const config = {
        ...defaultConfig,
        url: 'https://test.example.com/v2/spans',
        headers: { 'Content-Type': 'application/json' },
      };

      const delegate = createOtlpBrowserFetchExportDelegate(
        config,
        JsonTraceSerializer,
      );

      expect(delegate).to.be.an('object');
    });
  });
});
