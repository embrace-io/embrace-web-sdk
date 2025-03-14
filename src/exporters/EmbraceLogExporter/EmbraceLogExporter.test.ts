import { ExportResultCode } from '@opentelemetry/core';
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
      resource: { attributes: {} } as IResource, // casting required to avoid having to implement `merge` method
      instrumentationScope: { name: 'test' },
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
    const chromeContentLength = '189';
    const firefoxWebkitContentLength = '191';
    expect((headers as Record<string, string>)['Content-Length']).to.be.oneOf([
      chromeContentLength,
      firefoxWebkitContentLength
    ]);
    expect(fakeFetch.getUrl()).to.equal(
      'https://a-testAppID.data.stg.emb-eng.com/v2/logs'
    );
    // taken from an actual request
    const encodedBodyChrome = new Uint8Array([
      31, 139, 8, 0, 0, 0, 0, 0, 0, 19, 149, 143, 177, 10, 194, 64, 12, 134, 95,
      69, 254, 249, 134, 186, 222, 38, 130, 32, 72, 5, 81, 23, 113, 104, 123,
      161, 28, 182, 151, 146, 203, 21, 165, 244, 221, 165, 21, 234, 224, 36,
      153, 242, 125, 225, 79, 50, 64, 40, 114, 146, 138, 14, 92, 71, 216, 219,
      176, 0, 216, 1, 133, 170, 248, 50, 41, 77, 234, 110, 224, 132, 187, 142,
      220, 102, 193, 91, 78, 65, 97, 179, 209, 32, 86, 220, 125, 83, 230, 110,
      138, 8, 69, 75, 176, 80, 138, 138, 209, 160, 225, 250, 68, 21, 139, 251,
      140, 169, 111, 233, 18, 252, 51, 47, 2, 195, 34, 131, 1, 151, 145, 164,
      39, 119, 254, 85, 145, 122, 18, 175, 175, 60, 181, 37, 9, 236, 250, 139,
      206, 244, 84, 88, 236, 243, 221, 17, 6, 37, 187, 215, 180, 60, 170, 248,
      80, 95, 139, 38, 77, 55, 180, 92, 61, 86, 179, 26, 205, 31, 175, 221, 231,
      122, 3, 192, 10, 83, 28, 42, 1, 0, 0
    ]);
    const encodedBodyFirefoxWebkit = new Uint8Array([
      31, 139, 8, 0, 0, 0, 0, 0, 0, 19, 141, 143, 61, 11, 194, 64, 12, 134, 255,
      138, 100, 238, 80, 215, 219, 68, 16, 4, 169, 32, 213, 69, 58, 220, 71, 40,
      135, 189, 75, 185, 143, 210, 82, 252, 239, 222, 85, 104, 7, 23, 201, 16,
      242, 190, 15, 201, 155, 25, 28, 122, 138, 78, 226, 133, 90, 15, 236, 57,
      175, 2, 176, 25, 120, 8, 78, 139, 24, 48, 91, 77, 1, 202, 81, 223, 163,
      58, 172, 242, 145, 162, 13, 192, 202, 119, 1, 94, 82, 191, 109, 89, 166,
      188, 194, 114, 147, 58, 36, 54, 64, 162, 58, 106, 111, 40, 201, 169, 47,
      22, 180, 193, 187, 213, 99, 197, 45, 37, 170, 132, 2, 72, 120, 116, 3,
      170, 250, 215, 242, 56, 160, 211, 97, 170, 162, 17, 232, 128, 237, 55,
      169, 198, 49, 229, 128, 115, 117, 186, 38, 80, 144, 154, 242, 113, 159,
      114, 218, 246, 193, 187, 152, 51, 24, 146, 175, 221, 98, 165, 32, 255,
      191, 214, 44, 245, 1, 192, 10, 83, 28, 42, 1, 0, 0
    ]);
    // Chrome, Webkit and Firefox have slightly different encoding processes. But all of them decode the actual body correctly as the below object
    /*
    {
      "resourceLogs": [
          {
              "resource": {
                  "attributes": [],
                  "droppedAttributesCount": 0
              },
              "scopeLogs": [
                  {
                      "scope": {},
                      "logRecords": [
                          {
                              "timeUnixNano": "0",
                              "observedTimeUnixNano": "0",
                              "severityNumber": 1,
                              "severityText": "INFO",
                              "body": {
                                  "stringValue": "mock body"
                              },
                              "attributes": [],
                              "droppedAttributesCount": 0
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
