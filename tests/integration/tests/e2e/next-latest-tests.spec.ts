import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: 'Next Latest',
  url: 'http://localhost:3000',
  numberOfExpectedSpans: 13,
});
