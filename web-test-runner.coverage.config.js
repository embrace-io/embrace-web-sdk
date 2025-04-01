import baseConfig from './web-test-runner.config.js';

export default {
  ...baseConfig,
  coverage: true,
  coverageConfig: {
    include: ['src/**/*.ts'],
    report: true,
    reporters: ['cobertura'],
  },
};
