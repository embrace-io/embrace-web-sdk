import * as chai from 'chai';
import { SAMPLED_UUID } from '../testUtils/index.js';
import { getNormalizedDeviceId, isDeviceIdEnabled } from './isDeviceIdEnabled.js';

const { expect } = chai;

const TEST_CASES = [
  {
    deviceId: '07D85B44E4E245F4A30E559BFC800000',
    expectedNormalizedValue: 50.000002980232416, // 800000 == 8388608 => 8388608 / 16777215 * 100
    pctEnabled: 55,
    expected: true,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8A000000',
    expectedNormalizedValue: 0, // 000000 == 0
    pctEnabled: 0,
    expected: false,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8AD55B7A',
    expectedNormalizedValue: 83.34271212474776, // D55B7A == 13982586 => 13982586 / 16777215 * 100
    pctEnabled: 82,
    expected: false,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8AD55B7A',
    expectedNormalizedValue: 83.34271212474776, // D55B7A == 13982586 => 13982586 / 16777215 * 100
    pctEnabled: 85,
    expected: true,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8AD55B7A',
    expectedNormalizedValue: 83.34271212474776, // D55B7A == 13982586 => 13982586 / 16777215 * 100
    pctEnabled: 90,
    expected: true,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8AD55B8D',
    expectedNormalizedValue: 83.34282537357959, // D55B8D == 13982605 => 13982605 / 16777215 * 100
    pctEnabled: 83,
    expected: false,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8AD55B8D',
    expectedNormalizedValue: 83.34282537357959, // D55B8D == 13982605 => 13982605 / 16777215 * 100
    pctEnabled: 84,
    expected: true,
  },
  {
    deviceId: '99BB43AB21E0A33CADAEC32D8AFFFFFF',
    expectedNormalizedValue: 100, // FFFFFF == 16777215 (max value)
    pctEnabled: 84,
    expected: false,
  },
  {
    deviceId: '',
    expectedNormalizedValue: 0,
    pctEnabled: 0,
    expected: false,
  },
  {
    deviceId: '',
    expectedNormalizedValue: 0,
    pctEnabled: 1,
    expected: true,
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

describe('getNormalizedDeviceId', () => {
  TEST_CASES.forEach(({ deviceId, expectedNormalizedValue }) => {
    it(`should return ${String(expectedNormalizedValue)} for deviceId: ${deviceId}`, () => {
      const result = getNormalizedDeviceId(deviceId);
      expect(result).to.equal(expectedNormalizedValue);
    });
  });
});
