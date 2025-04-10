import baseConfig from './web-test-runner.config.js';

export default {
  ...baseConfig,
  coverage: true,
  coverageConfig: {
    reporters: ['cobertura'],
    include: ['src/**/*.ts'],
    exclude: [
      // no need to account for coverage for testing helpers
      'src/testUtils/**/*.ts',
    ],
    report: true,
  },
};
