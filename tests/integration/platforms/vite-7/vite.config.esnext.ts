import createConfig from './vite.config.base';

export default createConfig({
  target: 'esnext',
  outDir: 'dist/esnext',
  sondaOutput: '.sonda/esnext',
});
