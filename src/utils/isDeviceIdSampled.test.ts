import * as chai from 'chai';
import { isDeviceIdSampled } from './isDeviceIdSampled.js';
import { NOT_SAMPLED_UUID, SAMPLED_UUID } from '../testUtils/index.js';

const { expect } = chai;

describe('isDeviceIdSampled', () => {
  it('should return false for pctEnabled <= 0', () => {
    void expect(isDeviceIdSampled(SAMPLED_UUID, 0)).to.be.false;
    void expect(isDeviceIdSampled(SAMPLED_UUID, -10)).to.be.false;
  });

  it('should return false for pctEnabled > 100', () => {
    void expect(isDeviceIdSampled(SAMPLED_UUID, 101)).to.be.false;
  });

  it('should return true for a device ID that is sampled', () => {
    void expect(isDeviceIdSampled(SAMPLED_UUID, 50)).to.be.true;
  });

  it('should return false for a device ID that is not sampled', () => {
    void expect(isDeviceIdSampled(NOT_SAMPLED_UUID, 50)).to.be.false;
  });
});
