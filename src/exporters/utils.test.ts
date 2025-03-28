import { expect } from 'chai';
import { getDataURL, getEmbraceHeaders } from './utils.js';

describe('utils', () => {
  describe('getEmbraceHeaders', () => {
    it('should return correct headers', () => {
      const appID = 'testAppID';
      const userID = 'testUserID';
      const headers = getEmbraceHeaders(appID, userID);
      expect(headers).to.deep.equal({
        'X-EM-AID': appID,
        'X-EM-DID': userID,
      });
    });
  });

  describe('getDataURL', () => {
    it('should return correct data URL', () => {
      const appID = 'testAppID';
      const url = getDataURL(appID);
      expect(url).to.equal(`https://a-${appID}.data.stg.emb-eng.com`);
    });
  });
});
