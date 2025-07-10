import createConfig from './vite.config.base';

export default createConfig({
  target: 'es2015',
  outDir: 'dist/es2015',
  sondaOutput: '.sonda/es2015',
});
