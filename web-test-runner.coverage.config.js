import baseConfig from './web-test-runner.config.js';

export default {
  ...baseConfig,
  coverage: true,
  coverageConfig: {
    report: true,
    reporters: ['cobertura']
  }
};
