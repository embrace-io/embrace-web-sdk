import * as sinon from 'sinon';
import type { DynamicConfigManager } from '../../src/sdk/index.ts';

export const SAMPLED_UUID = '12345678-1234-1234-1234-000000000001';
export const NOT_SAMPLED_UUID = 'abcdefab-cdef-abcd-efab-ffffffffffff';
export const UUID_PATTERN = /^[A-F0-9]{32}$/;
export const TEST_DYNAMIC_CONFIG_MANAGER: DynamicConfigManager = {
  refreshRemoteConfig: sinon.stub(),
  setConfig: sinon.stub(),
  getConfig: () => ({
    samplingPct: 50,
    networkSpansForwardingThreshold: 50,
  }),
};
