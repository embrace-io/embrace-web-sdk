import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: 'Next 15 Turbopack Pages',
  url: 'http://localhost:3011',
  numberOfExpectedSpans: 13,
});
