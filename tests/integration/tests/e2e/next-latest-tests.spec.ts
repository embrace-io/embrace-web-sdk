import { runE2ETests } from '../../utils/index.js';

await runE2ETests({
  name: 'Next Latest',
  url: 'http://localhost:3000',
  numberOfExpectedSpans: 14,
});
