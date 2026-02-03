import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { getConfigURL } from './utils.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceConfigManager/utils', () => {
  describe('getConfigURL', () => {
    const defaultParams = {
      osVersion: '1.0.0',
      appVersion: '2.0.0',
      deviceId: 'device-123',
    };

    it('should return default base URL construction', () => {
      const result = getConfigURL('abc12', defaultParams);
      expect(result).to.equal(
        'https://a-abc12.config.emb-api.com/v2/config?appId=abc12&osVersion=1.0.0&appVersion=2.0.0&deviceId=device-123',
      );
    });

    it('should use custom embraceConfigURL override', () => {
      const result = getConfigURL(
        'abc12',
        defaultParams,
        'https://custom.config.com',
      );
      expect(result).to.equal(
        'https://custom.config.com/v2/config?appId=abc12&osVersion=1.0.0&appVersion=2.0.0&deviceId=device-123',
      );
    });

    it('should include all query parameters', () => {
      const params = {
        osVersion: 'Windows 10',
        appVersion: '3.5.0-beta',
        deviceId: 'uuid-device-id',
      };
      const result = getConfigURL('test1', params);

      expect(result).to.include('appId=test1');
      expect(result).to.include('osVersion=Windows 10');
      expect(result).to.include('appVersion=3.5.0-beta');
      expect(result).to.include('deviceId=uuid-device-id');
    });

    it('should handle empty string for embraceConfigURL as falsy', () => {
      const result = getConfigURL('abc12', defaultParams, '');
      // Empty string is falsy, so it should use default
      expect(result).to.include('https://a-abc12.config.emb-api.com');
    });
  });
});
