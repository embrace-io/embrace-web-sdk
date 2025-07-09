import * as chai from 'chai';
import { getDefaultAttributeScrubbers } from './defaultAttributeScrubbers.js';

const { expect } = chai;

describe('getDefaultAttributeScrubbers', () => {
  const tests: {
    name: string;
    key: string;
    value: string;
    additionalSensitiveQueryTokens?: string[];
    expected: string;
  }[] = [
    {
      name: 'scrub credentials from path',
      key: 'url.path',
      value: 'https://username:password@www.example.com/some/other/path',
      expected: 'https://REDACTED:REDACTED@www.example.com/some/other/path',
    },
    {
      name: 'scrub credentials from full url',
      key: 'url.full',
      value: 'https://username:password@www.example.com/some/other/path',
      expected: 'https://REDACTED:REDACTED@www.example.com/some/other/path',
    },
    {
      name: 'scrub credentials from deprecated url attribute',
      key: 'http.url',
      value: 'https://username:password@www.example.com/some/other/path',
      expected: 'https://REDACTED:REDACTED@www.example.com/some/other/path',
    },
    {
      name: 'scrub sensitive params from query string',
      key: 'url.query',
      value: '?foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
      expected: '?foo=bar&pw=REDACTED&foopw=safe&AWSAccessKeyId=REDACTED',
    },
    {
      name: 'scrub sensitive params from query string, single param',
      key: 'url.query',
      value: 'token=abcde',
      expected: 'token=REDACTED',
    },
    {
      name: 'scrub sensitive query string params from full url',
      key: 'url.full',
      value:
        'https://example.com/some/path/?foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
      expected:
        'https://example.com/some/path/?foo=bar&pw=REDACTED&foopw=safe&AWSAccessKeyId=REDACTED',
    },
    {
      name: 'scrub sensitive query string params from deprecated url attribute',
      key: 'http.url',
      value:
        'https://example.com/some/path/?foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
      expected:
        'https://example.com/some/path/?foo=bar&pw=REDACTED&foopw=safe&AWSAccessKeyId=REDACTED',
    },
    {
      name: 'scrub additional sensitive query string params from full url',
      key: 'url.full',
      additionalSensitiveQueryTokens: ['foo'],
      value:
        'https://example.com/some/path/?foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
      expected:
        'https://example.com/some/path/?foo=REDACTED&pw=REDACTED&foopw=safe&AWSAccessKeyId=REDACTED',
    },
    {
      name: 'leave a url with no sensitive values alone',
      key: 'url.full',
      value: 'https://example.com/some/path/?foo=bar&foopw=safe&something=baz',
      expected:
        'https://example.com/some/path/?foo=bar&foopw=safe&something=baz',
    },
  ];

  tests.forEach(test => {
    it(test.name, () => {
      const scrubbers = getDefaultAttributeScrubbers(
        test.additionalSensitiveQueryTokens
      );
      const scrubber = scrubbers.find(scrubber => scrubber.key === test.key);
      void expect(scrubber).not.to.be.undefined;
      expect(scrubber?.scrub(test.value)).to.be.equal(test.expected);
    });
  });
});
