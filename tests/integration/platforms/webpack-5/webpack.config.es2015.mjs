import { merge } from 'webpack-merge';
import baseConfig from './webpack.config.base.mjs';
import path from 'path';
import Sonda from 'sonda/webpack';

export default merge(baseConfig, {
  mode: 'production',
  output: {
    path: path.resolve('dist/es2015'),
    filename: 'embrace-web-sdk.js',
    clean: true,
    environment: {
      arrowFunction: false,
      const: false,
      destructuring: false,
      forOf: false,
      optionalChaining: false,
      dynamicImport: false,
      bigIntLiteral: false,
      module: false,
      templateLiteral: false,
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
            configFile: './babel.config.es2015.json',
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
      outputDir: '.sonda/es2015',
    }),
    new Sonda({
      format: 'html',
      open: false,
      gzip: true,
      outputDir: '.sonda/es2015',
    }),
  ],
  devServer: {
    static: {
      directory: path.resolve('dist/es2015'),
    },
    port: 3000,
    open: true,
    hot: true,
    compress: true,
  },
});
