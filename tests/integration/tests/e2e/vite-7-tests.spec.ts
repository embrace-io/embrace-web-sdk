import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: 'Vite 7 ESNext',
  url: 'http://localhost:3001/platforms/vite-7/esnext/index.html',
  numberOfExpectedSpans: 4,
});

runE2ETests({
  name: 'Vite 7 ES2015',
  url: 'http://localhost:3001/platforms/vite-7/es2015/index.html',
  numberOfExpectedSpans: 4,
});
