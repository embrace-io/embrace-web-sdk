import { ExportResultCode } from '@opentelemetry/core';
import type { IResource } from '@opentelemetry/resources';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import * as fakeFetch from '../../testUtils/fake-fetch/index.test.js';
import { EmbraceTraceExporter } from './EmbraceTraceExporter.js';
import type { EmbraceTraceExporterArgs } from './types.js';

chai.use(sinonChai);
const { expect } = chai;
// NOTE: this tests just validates that the right headers and url are used. It works as a simple integration tests.
// For detailed testing about the transport layer check the transport components and their unit tests
describe('EmbraceTraceExporter', () => {
  const mockAppID = 'testAppID';
  const mockUserID = 'testUserID';
  const mockSpans: ReadableSpan[] = [
    {
      name: 'mock span',
      kind: 1,
      spanContext: () => ({
        traceId: '1',
        spanId: '2',
        traceFlags: 1
      }),
      startTime: [0, 0],
      endTime: [0, 0],
      status: { code: 1 },
      attributes: {},
      links: [],
      events: [],
      duration: [0, 0],
      ended: true,
      resource: { attributes: {} } as IResource, // casting required to avoid having to implement `merge` method
      instrumentationLibrary: { name: 'test', version: '1' },
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0
    }
  ];

  beforeEach(() => {
    fakeFetch.install();
  });

  afterEach(() => {
    fakeFetch.restore();
  });

  it('should initialize', () => {
    const args: EmbraceTraceExporterArgs = {
      appID: mockAppID,
      userID: mockUserID
    };
    const exporter = new EmbraceTraceExporter(args);

    expect(exporter).to.be.instanceOf(EmbraceTraceExporter);
  });

  it('should send using fetch with the right config', async () => {
    fakeFetch.respondWith('');
    const args: EmbraceTraceExporterArgs = {
      appID: mockAppID,
      userID: mockUserID
    };

    const exporter = new EmbraceTraceExporter(args);
    await new Promise<void>(resolve => {
      exporter.export(mockSpans, result => {
        expect(result.code).to.equal(ExportResultCode.SUCCESS);
        resolve();
      });
    });
    expect(fakeFetch.getMethod()).to.equal('POST');
    const headers = fakeFetch.getRequestHeaders();
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
    // TODO does our BE process both without issues?
    const chromeContentLength = '203';
    const firefoxWebkitContentLength = '205';
    expect((headers as Record<string, string>)['Content-Length']).to.be.oneOf([
      chromeContentLength,
      firefoxWebkitContentLength
    ]);
    expect(fakeFetch.getUrl()).to.equal(
      'https://a-testAppID.data.stg.emb-eng.com/v2/spans'
    );
    // taken from an actual request
    const encodedBodyChrome = new Uint8Array([
      31, 139, 8, 0, 0, 0, 0, 0, 0, 19, 141, 144, 177, 10, 2, 49, 16, 68, 127,
      69, 166, 222, 66, 45, 211, 137, 88, 8, 98, 163, 86, 98, 17, 147, 45, 194,
      121, 155, 35, 217, 19, 225, 240, 223, 37, 17, 79, 5, 11, 217, 106, 223,
      204, 14, 204, 14, 72, 156, 99, 159, 28, 239, 58, 43, 25, 230, 56, 140, 4,
      102, 128, 85, 77, 225, 220, 43, 23, 233, 68, 240, 41, 118, 29, 251, 197,
      136, 151, 177, 23, 133, 153, 222, 9, 217, 197, 238, 35, 166, 174, 37, 67,
      108, 203, 48, 80, 206, 10, 194, 149, 83, 14, 81, 96, 48, 67, 57, 26, 253,
      154, 172, 227, 181, 175, 194, 147, 215, 101, 14, 122, 37, 180, 209, 53,
      147, 34, 128, 208, 4, 241, 48, 115, 66, 86, 155, 116, 31, 90, 62, 72, 184,
      109, 173, 68, 24, 76, 65, 96, 241, 63, 232, 223, 125, 8, 124, 101, 209,
      111, 219, 170, 162, 183, 37, 171, 213, 62, 151, 142, 46, 122, 134, 153,
      221, 9, 151, 32, 205, 247, 213, 166, 144, 241, 79, 167, 58, 15, 201, 171,
      118, 165, 120, 1, 0, 0
    ]);
    const encodedBodyFirefoxWebkit = new Uint8Array([
      31, 139, 8, 0, 0, 0, 0, 0, 0, 19, 141, 144, 49, 11, 194, 48, 16, 133, 255,
      138, 220, 220, 161, 237, 216, 77, 196, 65, 16, 23, 117, 146, 14, 49, 185,
      33, 212, 94, 74, 114, 41, 66, 241, 191, 123, 137, 82, 45, 56, 72, 134,
      112, 223, 123, 247, 46, 151, 9, 60, 6, 23, 189, 198, 227, 160, 40, 64,
      115, 153, 102, 2, 205, 4, 138, 217, 219, 107, 100, 76, 82, 91, 128, 241,
      110, 24, 208, 172, 103, 188, 113, 145, 24, 154, 242, 81, 64, 208, 110,
      248, 138, 201, 101, 202, 32, 213, 203, 13, 98, 102, 40, 96, 68, 31, 172,
      35, 1, 21, 164, 166, 217, 207, 94, 105, 220, 153, 44, 188, 120, 46, 106,
      41, 222, 9, 189, 211, 221, 42, 9, 130, 58, 75, 162, 214, 98, 100, 229,
      249, 100, 123, 60, 147, 189, 31, 20, 57, 49, 150, 98, 64, 50, 63, 232,
      223, 251, 72, 192, 136, 196, 75, 219, 54, 163, 143, 69, 102, 115, 12, 105,
      71, 237, 140, 188, 176, 146, 133, 110, 150, 186, 101, 215, 62, 145, 249,
      159, 218, 124, 158, 201, 171, 118, 165, 120, 1, 0, 0
    ]);
    // Chrome, Webkit and Firefox have slightly different encoding processes. But all of them decode the actual body correctly as the below object
    /*
    {
      "resourceSpans": [
        {
          "resource": {
            "attributes": [],
            "droppedAttributesCount": 0
          },
          "scopeSpans": [
            {
              "scope": {
                "name": "test",
                "version": "1"
              },
              "spans": [
                {
                  "traceId": "1",
                  "spanId": "2",
                  "name": "mock span",
                  "kind": 2,
                  "startTimeUnixNano": "0",
                  "endTimeUnixNano": "0",
                  "attributes": [],
                  "droppedAttributesCount": 0,
                  "events": [],
                  "droppedEventsCount": 0,
                  "status": {
                    "code": 1
                  },
                  "links": [],
                  "droppedLinksCount": 0
                }
              ]
            }
          ]
        }
      ]
    }
     */
    // to validate what the encoded body translates to, or compare different browsers,
    // uncomment the following lines and check the console using npm run
    // sdk:test:manual from different browsers
    // const blob = new Blob([fakeFetch.getBody() as Uint8Array]);
    // const decompressedStream = new DecompressionStream('gzip');
    // const decompressedBlob = blob.stream().pipeThrough(decompressedStream);
    // const text = await new Response(decompressedBlob).text();
    // console.log(JSON.parse(text));
    const body = fakeFetch.getBody();
    void expect(body).not.to.be.null;
    const encodedBodyString = JSON.stringify(fakeFetch.getBody());
    const expectedBodyChromeString = JSON.stringify(encodedBodyChrome);
    const expectedBodyFirefoxWebkitString = JSON.stringify(
      encodedBodyFirefoxWebkit
    );
    expect(encodedBodyString).to.be.oneOf([
      expectedBodyChromeString,
      expectedBodyFirefoxWebkitString
    ]);
  });
});
