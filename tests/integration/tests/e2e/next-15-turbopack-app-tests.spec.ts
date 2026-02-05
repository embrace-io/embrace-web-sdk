import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: 'Next 15 Turbopack App',
  url: 'http://localhost:3010',
  numberOfExpectedSpans: 12,
});
