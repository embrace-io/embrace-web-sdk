import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: 'Webpack 5 ESNext',
  url: 'http://localhost:3001/platforms/webpack-5/esnext/index.html',
  numberOfExpectedSpans: 3,
});

runE2ETests({
  name: 'Webpack 5 ES2015',
  url: 'http://localhost:3001/platforms/webpack-5/es2015/index.html',
  numberOfExpectedSpans: 3,
});
