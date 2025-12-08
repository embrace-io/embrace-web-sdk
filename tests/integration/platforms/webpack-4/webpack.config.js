const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'embrace-web-sdk.js',
  },
  resolve: {
    alias: {
      '@opentelemetry/semantic-conventions/incubating': path.resolve(
        __dirname,
        './node_modules/@opentelemetry/semantic-conventions/build/src/index-incubating.js',
      ),
      uuid: path.resolve(__dirname, './node_modules/uuid/dist/index.js'),
      // @bufbuild/protobuf uses subpath exports which webpack 4 doesn't support
      '@bufbuild/protobuf/codegenv1': path.resolve(
        __dirname,
        '../../../../node_modules/@bufbuild/protobuf/dist/esm/codegenv1/index.js',
      ),
      '@bufbuild/protobuf': path.resolve(
        __dirname,
        '../../../../node_modules/@bufbuild/protobuf/dist/esm/index.js',
      ),
    },
  },
  devServer: {
    open: true,
    host: 'localhost',
  },
  devtool: 'source-map',
  plugins: [
    new HtmlWebpackPlugin({
      template: 'index.html',
    }),
  ],
  module: {
    rules: [
      {
        test: /\.m?js$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
      {
        test: /\.html$/i,
        use: ['html-loader'],
      },
    ],
  },
};
