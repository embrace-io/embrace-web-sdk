import baseConfig from './web-test-runner.config.js';

export default {
  ...baseConfig,
  coverage: true,
  coverageConfig: {
    reporters: ['cobertura'],
    include: ['src/**/*.ts'],
    report: true,
  },
};
