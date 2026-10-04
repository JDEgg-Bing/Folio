import type { Configuration } from 'webpack';
const rules: NonNullable<Configuration['module']>['rules'] = [{
  test: /\.tsx?$/,
  exclude: /node_modules/,
  use: [{ loader: 'ts-loader', options: { transpileOnly: false } }]
}];

rules.push({ test: /\.(woff2?|ttf)$/, type: 'asset/resource' });
rules.push({ test: /\.png$/, type: 'asset/resource' });
const config: Configuration = { module: { rules }, resolve: { extensions: ['.ts', '.tsx', '.js', '.jsx'] } };
export default config;
