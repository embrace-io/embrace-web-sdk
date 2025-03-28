import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
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
} from '../../testUtils/index.js';
import { mockSpan } from '../../testUtils/mockEntities/ReadableSpan.js';
import { EmbraceTraceExporter } from './EmbraceTraceExporter.js';
import type { EmbraceTraceExporterArgs } from './types.js';

chai.use(sinonChai);
const { expect } = chai;
// NOTE: this tests just validates that the right headers and url are used. It works as a simple integration tests.
// For detailed testing about the transport layer check the transport components and their unit tests
describe('EmbraceTraceExporter', () => {
  const mockAppID = 'testAppID';
  const mockUserID = 'testUserID';
  const mockSpans: ReadableSpan[] = [mockSpan];

  beforeEach(() => {
    fakeFetchInstall();
  });

  afterEach(() => {
    fakeFetchRestore();
  });

  it('should initialize', () => {
    const args: EmbraceTraceExporterArgs = {
      appID: mockAppID,
      userID: mockUserID,
    };
    const exporter = new EmbraceTraceExporter(args);

    expect(exporter).to.be.instanceOf(EmbraceTraceExporter);
  });

  it('should send using fetch with the right config', async () => {
    fakeFetchRespondWith('');
    const args: EmbraceTraceExporterArgs = {
      appID: mockAppID,
      userID: mockUserID,
    };

    const exporter = new EmbraceTraceExporter(args);
    await new Promise<void>(resolve => {
      exporter.export(mockSpans, result => {
        expect(result.code).to.equal(ExportResultCode.SUCCESS);
        resolve();
      });
    });
    expect(fakeFetchGetMethod()).to.equal('POST');
    const headers = fakeFetchGetRequestHeaders();
    expect((headers as Record<string, string>)['Content-Encoding']).to.equal(
      'gzip'
    );
    expect((headers as Record<string, string>)['Content-Type']).to.equal(
      'application/json'
    );
    expect((headers as Record<string, string>)['X-EM-AID']).to.equal(mockAppID);
    expect((headers as Record<string, string>)['X-EM-DID']).to.equal(
      mockUserID
    );
    // Chrome, Webkit and Firefox have slightly different encoding processes- Content-Length values. 182 for Chrome, 184 for Firefox and Webkit.
    const chromeContentLength = '203';
    const firefoxWebkitContentLength = '205';
    //TODO we should find a way to know if we are running in Chrome, Firefox or Webkit and just assert for the specific value for each browser
    expect((headers as Record<string, string>)['Content-Length']).to.be.oneOf([
      chromeContentLength,
      firefoxWebkitContentLength,
    ]);
    expect(fakeFetchGetUrl()).to.equal(
      'https://a-testAppID.data.stg.emb-eng.com/v2/spans'
    );
    // assert that the decompressed and decoded body is the expected one
    const body = fakeFetchGetBody();
    void expect(body).not.to.be.null;
    const expectedBody = {
      resourceSpans: [
        {
          resource: {
            attributes: [],
            droppedAttributesCount: 0,
          },
          scopeSpans: [
            {
              scope: {
                name: 'test',
                version: '1',
              },
              spans: [
                {
                  traceId: '1',
                  spanId: '2',
                  name: 'mock span',
                  kind: 2,
                  startTimeUnixNano: '0',
                  endTimeUnixNano: '0',
                  attributes: [],
                  droppedAttributesCount: 0,
                  events: [],
                  droppedEventsCount: 0,
                  status: {
                    code: 1,
                  },
                  links: [],
                  droppedLinksCount: 0,
                },
              ],
            },
          ],
        },
      ],
    };
    const decompressedStream = new Response(body).body?.pipeThrough(
      new DecompressionStream('gzip')
    );
    // translate from Uint8Array to string
    const text = await new Response(decompressedStream).text();
    const parsed = JSON.parse(text) as never;
    expect(parsed).to.deep.equal(expectedBody);
  });
});
