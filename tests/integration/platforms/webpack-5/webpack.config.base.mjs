import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack'

console.log('Using webpack 5 config for integration tests', process.env.EMBRACE_DATA_URL);

export default {
  devtool: 'source-map',
  entry: './src/index.tsx',
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader', // configFile defined per target
        },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
    new webpack.DefinePlugin({
      'process.env.EMBRACE_DATA_URL': JSON.stringify(
        process.env.EMBRACE_DATA_URL
      ),
    }),
  ],
  devServer: {
    static: './dist',
    hot: true,
    port: 3000,
    open: true,
  },
  mode: 'development',
};
