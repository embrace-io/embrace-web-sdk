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
        './node_modules/@opentelemetry/semantic-conventions/build/src/index-incubating.js'
      ),
      uuid: path.resolve(__dirname, './node_modules/uuid/dist/index.js'),
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
