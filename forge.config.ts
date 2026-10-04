import type { ForgeConfig } from '@electron-forge/shared-types';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { execFileSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const config: ForgeConfig = {
  packagerConfig: { asar: true, icon: 'assets/folio.ico', executableName: 'Folio', download: { cacheRoot: resolve('out/electron-cache') }, extraResource: ['assets/folio.ico', 'out/release-resources', 'docs/docx-third-party-notices.md', 'node_modules/mathml2omml'] },
  rebuildConfig: {},
  makers: [new MakerSquirrel({ name: 'markdown_editor_v1', title: 'Folio', setupIcon: 'assets/folio.ico', nuspecTemplate: 'assets/folio.nuspectemplate' })],
  hooks: {
    prePackage: async () => { execFileSync(process.execPath, ['scripts/prepare-release.cjs'], { stdio: 'inherit', windowsHide: true }); },
    preMake: async () => {
      // Older local builds lacked these runtime filenames. Prepare them
      // deterministically instead of depending on a manual dependency repair.
      const vendor = join(dirname(require.resolve('electron-winstaller/package.json')), 'vendor');
      for (const extension of ['exe', 'dll']) copyFileSync(join(vendor, `7z-${process.arch}.${extension}`), join(vendor, `7z.${extension}`));
    }
  },
  plugins: [
    new WebpackPlugin({
      mainConfig: './webpack.main.config.ts',
      renderer: {
        config: './webpack.renderer.config.ts',
        entryPoints: [{
          name: 'main_window',
          html: './src/renderer/index.html',
          js: './src/renderer/index.tsx',
          preload: { js: './src/preload/preload.ts' }
        }]
      }
    })
  ]
};

export default config;
