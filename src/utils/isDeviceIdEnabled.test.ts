import * as chai from 'chai';
import { isDeviceIdEnabled } from './isDeviceIdEnabled.js';
import { SAMPLED_UUID } from '../testUtils/index.js';

const { expect } = chai;

const TEST_CASES = [
  {
    deviceId: '99BB43AB21E0A33CADAEC32D80000000',
    pctEnabled: 0,
    expected: false,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8AD55B7A',
    pctEnabled: 82,
    expected: false,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8AD55B7A',
    pctEnabled: 85,
    expected: true,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8AD55B7A',
    pctEnabled: 90,
    expected: true,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8AD55B8D',
    pctEnabled: 83,
    expected: false,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8AD55B8D',
    pctEnabled: 84,
    expected: true,
  },
  {
    deviceId: '',
    pctEnabled: 0,
    expected: false,
  },
  {
    deviceId: '',
    pctEnabled: 1,
    expected: false,
  },
];

describe('isDeviceIdEnabled', () => {
  it('should return false for pctEnabled <= 0', () => {
    void expect(isDeviceIdEnabled(SAMPLED_UUID, 0)).to.be.false;
    void expect(isDeviceIdEnabled(SAMPLED_UUID, -10)).to.be.false;
  });

  it('should return false for pctEnabled > 100', () => {
    void expect(isDeviceIdEnabled(SAMPLED_UUID, 101)).to.be.false;
  });

  TEST_CASES.forEach(({ deviceId, pctEnabled, expected }) => {
    it(`should return ${String(expected)} for deviceId: ${deviceId}, pctEnabled: ${pctEnabled.toString()}`, () => {
      const result = isDeviceIdEnabled(deviceId, pctEnabled);
      expect(result).to.equal(expected);
    });
  });
});
