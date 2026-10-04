import type { Configuration } from 'webpack';
import { resolve } from 'node:path';
const rules: NonNullable<Configuration['module']>['rules'] = [{ test: /katex\.min\.css$/, use: [resolve('scripts/inline-print-css.cjs')] }, {
  test: /\.tsx?$/,
  exclude: /node_modules/,
  use: [{ loader: 'ts-loader', options: { transpileOnly: false } }]
}];

const config: Configuration = {
  entry: { index: './src/main/main.ts', 'word-template-analysis-worker': './src/main/export/WordTemplateAnalysisWorker.ts' },
  output: { filename: '[name].js' },
  module: { rules },
  resolve: { extensions: ['.ts', '.js'] }
};
export default config;
