import * as chai from 'chai';
import { resolveUrl } from './resolveUrl.ts';

const { expect } = chai;

describe('resolveUrl', () => {
  it('resolves a relative URL against the document', () => {
    expect(resolveUrl('/api/products')).to.equal(
      new URL('/api/products', document.baseURI).href,
    );
  });

  it('normalizes the scheme, host and default port', () => {
    expect(resolveUrl('HTTPS://Example.COM:443/v2/logs')).to.equal(
      'https://example.com/v2/logs',
    );
  });

  it('returns a URL that cannot be parsed unchanged', () => {
    expect(resolveUrl('http://[invalid')).to.equal('http://[invalid');
  });
});
