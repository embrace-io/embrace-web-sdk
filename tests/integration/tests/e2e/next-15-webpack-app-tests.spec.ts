import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: 'Next 15 Webpack App',
  url: 'http://localhost:3012',
  numberOfExpectedSpans: 14,
});
