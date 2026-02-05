import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: 'Vite 6 ES2015',
  url: 'http://localhost:3001/platforms/vite-6/es2015/index.html',
  numberOfExpectedSpans: 3,
});
