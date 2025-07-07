import { merge } from 'webpack-merge';
import baseConfig from './webpack.config.base.mjs';
import path from 'path';
import Sonda from 'sonda/webpack';

export default merge(baseConfig, {
  mode: 'production',
  output: {
    path: path.resolve('dist/esnext'),
    filename: 'bundle.js',
    clean: true,
    environment: {
      arrowFunction: true,
      const: true,
      destructuring: true,
      forOf: true,
      optionalChaining: true,
      dynamicImport: true,
      bigIntLiteral: true,
      module: true,
      templateLiteral: true,
    },
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            configFile: './babel.config.esnext.json',
          },
        },
      },
    ],
  },
  plugins: [
    new Sonda({
      format: 'json',
      open: false,
      gzip: true,
      outputDir: '.sonda/esnext',
    }),
    new Sonda({
      format: 'html',
      open: false,
      gzip: true,
      outputDir: '.sonda/esnext',
    }),
  ],
  devServer: {
    static: {
      directory: path.resolve('dist/esnext'),
    },
    port: 3000,
    open: true,
    hot: true,
    compress: true,
  },
});
