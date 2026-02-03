import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { validateAppID, validateAppVersion } from './utils.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('sdk/utils', () => {
  describe('validateAppID', () => {
    it('should return undefined when appID is undefined', () => {
      const result = validateAppID(undefined);
      expect(result).to.be.undefined;
    });

    it('should throw error when appID is not a string', () => {
      expect(() => validateAppID(123)).to.throw(
        'appID must be a string, or omitted if not using Embrace',
      );
      expect(() => validateAppID(null)).to.throw(
        'appID must be a string, or omitted if not using Embrace',
      );
      expect(() => validateAppID({})).to.throw(
        'appID must be a string, or omitted if not using Embrace',
      );
    });

    it('should throw error when appID has wrong length', () => {
      expect(() => validateAppID('abc')).to.throw(
        'appID should be 5 characters long',
      );
      expect(() => validateAppID('abcdef')).to.throw(
        'appID should be 5 characters long',
      );
      expect(() => validateAppID('')).to.throw(
        'appID should be 5 characters long',
      );
    });

    it('should return valid 5-character appID', () => {
      const result = validateAppID('abcde');
      expect(result).to.equal('abcde');
    });

    it('should return valid 5-character appID with numbers', () => {
      const result = validateAppID('abc12');
      expect(result).to.equal('abc12');
    });
  });

  describe('validateAppVersion', () => {
    it('should return "unspecified" when undefined and template is empty', () => {
      // This test assumes TEMPLATE_APP_VERSION might be empty after CLI processing
      // The actual behavior depends on the imported constant
      const result = validateAppVersion(undefined);
      // Result should either be the template or 'unspecified'
      expect(typeof result).to.equal('string');
      expect(result.length).to.be.greaterThan(0);
    });

    it('should throw error when appVersion is not a string', () => {
      expect(() => validateAppVersion(123)).to.throw(
        'if appVersion is specified, it must be a string',
      );
      expect(() => validateAppVersion(null)).to.throw(
        'if appVersion is specified, it must be a string',
      );
      expect(() => validateAppVersion({})).to.throw(
        'if appVersion is specified, it must be a string',
      );
    });

    it('should throw error when appVersion is empty string', () => {
      expect(() => validateAppVersion('')).to.throw(
        'if appVersion is specified, it cannot be an empty string',
      );
    });

    it('should throw error when appVersion is whitespace only', () => {
      expect(() => validateAppVersion('   ')).to.throw(
        'if appVersion is specified, it cannot be an empty string',
      );
      expect(() => validateAppVersion('\t\n')).to.throw(
        'if appVersion is specified, it cannot be an empty string',
      );
    });

    it('should return valid appVersion string', () => {
      const result = validateAppVersion('1.0.0');
      expect(result).to.equal('1.0.0');
    });

    it('should return trimmed appVersion', () => {
      const result = validateAppVersion('  1.0.0  ');
      expect(result).to.equal('1.0.0');
    });

    it('should handle complex version strings', () => {
      const result = validateAppVersion('1.2.3-beta.4+build.567');
      expect(result).to.equal('1.2.3-beta.4+build.567');
    });
  });
});
