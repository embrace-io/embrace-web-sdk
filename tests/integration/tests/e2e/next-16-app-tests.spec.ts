import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: 'Next 16 App',
  url: 'http://localhost:3014',
  numberOfExpectedSpans: 12,
});
