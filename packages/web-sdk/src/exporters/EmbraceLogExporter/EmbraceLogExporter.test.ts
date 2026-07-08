import { ExportResultCode } from '@opentelemetry/core';
import { emptyResource } from '@opentelemetry/resources';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import {
  fakeFetchGetBody,
  fakeFetchGetMethod,
  fakeFetchGetRequestHeaders,
  fakeFetchGetUrl,
  fakeFetchInstall,
  fakeFetchRespondWith,
  fakeFetchRestore,
} from '../../../tests/utils/index.ts';
import { EmbraceLogExporter } from './EmbraceLogExporter.ts';
import type { EmbraceLogExporterArgs } from './types.ts';

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
      resource: emptyResource(),
      instrumentationScope: { name: 'test' },
      attributes: {},
      droppedAttributesCount: 0,
    },
  ];

  beforeEach(() => {
    fakeFetchInstall();
  });

  afterEach(() => {
    fakeFetchRestore();
  });

  it('should initialize ', () => {
    const args: EmbraceLogExporterArgs = {
      appID: mockAppID,
      userID: mockUserID,
    };
    const exporter = new EmbraceLogExporter(args);
    expect(exporter).to.be.instanceOf(EmbraceLogExporter);
  });

  it('should send using fetch with the right config', async () => {
    fakeFetchRespondWith('');
    const args: EmbraceLogExporterArgs = {
      appID: mockAppID,
      userID: mockUserID,
    };

    const exporter = new EmbraceLogExporter(args);
    await new Promise<void>((resolve) => {
      exporter.export(mockLogs, (result) => {
        expect(result.code).to.equal(ExportResultCode.SUCCESS);
        resolve();
      });
    });
    expect(fakeFetchGetMethod()).to.equal('POST');
    const headers = fakeFetchGetRequestHeaders();
    expect((headers as Record<string, string>)['Content-Encoding']).to.equal(
      'gzip',
    );
    expect((headers as Record<string, string>)['Content-Type']).to.equal(
      'application/json',
    );
    expect((headers as Record<string, string>)['X-EM-AID']).to.equal(mockAppID);
    expect((headers as Record<string, string>)['X-EM-DID']).to.equal(
      mockUserID,
    );
    expect((headers as Record<string, string>)['Content-Length']).to.equal(
      '189',
    );
    expect(fakeFetchGetUrl()).to.equal(
      'https://a-testAppID.data.emb-api.com/v2/logs',
    );
    const body = fakeFetchGetBody();
    void expect(body).not.to.be.null;
    // assert that the decompressed and decoded body is the expected one
    const expectedBody = {
      resourceLogs: [
        {
          resource: {
            attributes: [],
            droppedAttributesCount: 0,
          },
          scopeLogs: [
            {
              scope: { name: 'test' },
              logRecords: [
                {
                  timeUnixNano: '0',
                  observedTimeUnixNano: '0',
                  severityNumber: 1,
                  severityText: 'INFO',
                  body: {
                    stringValue: 'mock body',
                  },
                  attributes: [],
                  droppedAttributesCount: 0,
                },
              ],
            },
          ],
        },
      ],
    };
    const decompressedStream = new Response(body).body?.pipeThrough(
      new DecompressionStream('gzip'),
    );
    // translate from Uint8Array to string
    const text = await new Response(decompressedStream).text();
    const parsed = JSON.parse(text) as never;
    expect(parsed).to.deep.equal(expectedBody);
  });

  it('should use the provided embraceDataURL', async () => {
    const mockEmbraceDataURL = 'http://localhost:3000';

    fakeFetchRespondWith('');
    const args: EmbraceLogExporterArgs = {
      appID: mockAppID,
      userID: mockUserID,
      embraceDataURL: mockEmbraceDataURL,
    };

    const exporter = new EmbraceLogExporter(args);

    await new Promise<void>((resolve) => {
      exporter.export(mockLogs, (result) => {
        expect(result.code).to.equal(ExportResultCode.SUCCESS);
        resolve();
      });
    });

    expect(fakeFetchGetMethod()).to.equal('POST');
    expect(fakeFetchGetUrl()).to.equal(`${mockEmbraceDataURL}/v2/logs`);
  });
});
