import {
  ExportResultCode,
  type InstrumentationScope
} from '@opentelemetry/core';
import type { IResource } from '@opentelemetry/resources';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import * as fakeFetch from '../../testUtils/fake-fetch/index.test.js';
import { EmbraceLogExporter } from './EmbraceLogExporter.js';
import type { EmbraceLogExporterArgs } from './types.js';

chai.use(sinonChai);
const { expect } = chai;
// NOTE: this tests just validates that the right headers and url are used. It works as a simple integration tests.
// For detailed testing about the transport check the transport components and their unit tests
describe('EmbraceLogExporter', () => {
  const mockAppID = 'testAppID';
  const mockUserID = 'testUserID';
  const mockLogs: ReadableLogRecord[] = [
    {
      hrTime: [0, 0],
      hrTimeObserved: [0, 0],
      spanContext: undefined,
      severityText: 'INFO',
      severityNumber: 1,
      body: 'mock body',
      resource: {} as IResource,
      instrumentationScope: {} as InstrumentationScope,
      attributes: {},
      droppedAttributesCount: 0
    }
  ];

  beforeEach(() => {
    fakeFetch.install();
  });

  afterEach(() => {
    fakeFetch.restore();
  });

  it('should initialize ', () => {
    const args: EmbraceLogExporterArgs = {
      appID: mockAppID,
      userID: mockUserID
    };
    const exporter = new EmbraceLogExporter(args);
    expect(exporter).to.be.instanceOf(EmbraceLogExporter);
  });

  it('should send using fetch with the right config', async () => {
    fakeFetch.respondWith('');
    const args: EmbraceLogExporterArgs = {
      appID: mockAppID,
      userID: mockUserID
    };

    const exporter = new EmbraceLogExporter(args);
    await new Promise<void>(resolve => {
      exporter.export(mockLogs, result => {
        expect(result.code).to.equal(ExportResultCode.SUCCESS);
        resolve();
      });
    });
    expect(fakeFetch.getMethod()).to.equal('get');
    expect(fakeFetch.getRequestHeaders()).to.deep.equal({
      'Content-Type': 'application/json',
      'X-Embrace-App-ID': mockAppID,
      'X-Embrace-User-ID': mockUserID
    });
    expect(fakeFetch.getUrl()).to.equal('');
    expect(fakeFetch.getBody()).to.deep.equal({});
  });
});
