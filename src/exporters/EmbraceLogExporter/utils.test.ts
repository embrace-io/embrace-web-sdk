import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { getLogEndpoint } from './utils.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceLogExporter/utils', () => {
  describe('getLogEndpoint', () => {
    it('should return default URL with appID', () => {
      const result = getLogEndpoint('abc12');
      expect(result).to.equal('https://a-abc12.data.emb-api.com/v2/logs');
    });

    it('should use custom base URL when provided', () => {
      const result = getLogEndpoint('abc12', 'https://custom.example.com');
      expect(result).to.equal('https://custom.example.com/v2/logs');
    });

    it('should handle different appID formats', () => {
      const result = getLogEndpoint('12345');
      expect(result).to.equal('https://a-12345.data.emb-api.com/v2/logs');
    });
  });
});
