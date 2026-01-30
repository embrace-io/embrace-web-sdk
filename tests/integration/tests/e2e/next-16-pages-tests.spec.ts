import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: 'Next 16 Pages',
  url: 'http://localhost:3015',
  numberOfExpectedSpans: 13,
});
