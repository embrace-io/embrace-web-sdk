import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: 'Next 15 Webpack Pages',
  url: 'http://localhost:3013',
  numberOfExpectedSpans: 10,
});
