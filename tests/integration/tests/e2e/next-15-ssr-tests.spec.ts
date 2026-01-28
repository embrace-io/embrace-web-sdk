import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: 'Next 15 SSR',
  url: 'http://localhost:3002',
  numberOfExpectedSpans: 13,
});
