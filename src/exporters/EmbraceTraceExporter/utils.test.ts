import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { getTraceEndpoint } from './utils.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceTraceExporter/utils', () => {
  describe('getTraceEndpoint', () => {
    it('should return default URL with appID', () => {
      const result = getTraceEndpoint('abc12');
      expect(result).to.equal('https://a-abc12.data.emb-api.com/v2/spans');
    });

    it('should use custom base URL when provided', () => {
      const result = getTraceEndpoint('abc12', 'https://custom.example.com');
      expect(result).to.equal('https://custom.example.com/v2/spans');
    });

    it('should handle different appID formats', () => {
      const result = getTraceEndpoint('12345');
      expect(result).to.equal('https://a-12345.data.emb-api.com/v2/spans');
    });
  });
});
