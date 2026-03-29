import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type { Plugin } from 'vite';

type WebAssetSource = 'local' | 'jsdelivr' | 'statically';

const ASSETS = [
  {
    packageName: '@mercuryworkshop/scramjet',
    file: 'dist/scramjet.js',
  },
  {
    packageName: '@mercuryworkshop/scramjet',
    file: 'dist/scramjet.wasm',
  },
  {
    packageName: '@mercuryworkshop/scramjet-controller',
    file: 'dist/controller.inject.js',
  },
] as const;

const PACKAGE_VERSIONS = new Map<(typeof ASSETS)[number]['packageName'], string>();

for (const { packageName } of ASSETS) {
  const packageJson = JSON.parse(
    await readFile(resolve('node_modules', packageName, 'package.json'), 'utf8'),
  ) as { version: string };

  PACKAGE_VERSIONS.set(packageName, packageJson.version);
}

const WEB_ASSET_SOURCE = (process.env.ZERO_K_CDN as WebAssetSource | undefined) || 'local';

const getAssetName = (asset: (typeof ASSETS)[number]) => basename(asset.file);
const getAssetSourcePath = (asset: (typeof ASSETS)[number]) =>
  resolve('node_modules', asset.packageName, asset.file);

const getPackageVersion = (packageName: (typeof ASSETS)[number]['packageName']) => {
  const version = PACKAGE_VERSIONS.get(packageName);
  if (version) {
    return version;
  }

  throw new Error(`Missing package version for ${packageName}`);
};

const buildNpmCdnUrl = (asset: (typeof ASSETS)[number]) => {
  const version = getPackageVersion(asset.packageName);
  if (WEB_ASSET_SOURCE == 'jsdelivr') {
    return `https://cdn.jsdelivr.net/npm/${asset.packageName}@${version}/${asset.file}`;
  }

  return `https://cdn.statically.io/npm/${asset.packageName}@${version}/${asset.file}`;
};

export const webAssets = (): Plugin => {
  const ASSET_MAP = new Map<string, string>();

  function replaceAssets(content: string): string {
    return content.replace(/WEB_ASSET\(([^)]+)\)/g, (_, filename) => {
      const assetUrl = ASSET_MAP.get(filename);
      if (!assetUrl) {
        throw new Error(
          `WEB_ASSET: Could not find asset "${filename}". Available assets: ${Array.from(ASSET_MAP.keys()).join(', ')}`,
        );
      }
      return assetUrl;
    });
  }

  return {
    name: 'web-assets',
    apply: 'build',

    async generateBundle(_, bundle) {
      ASSET_MAP.clear();
      for (const asset of ASSETS) {
        const assetUrl =
          WEB_ASSET_SOURCE == 'local'
            ? `./${this.getFileName(
                this.emitFile({
                  type: 'asset',
                  name: getAssetName(asset),
                  source: await readFile(getAssetSourcePath(asset)),
                }),
              )}`
            : buildNpmCdnUrl(asset);

        ASSET_MAP.set(getAssetName(asset), assetUrl);
      }

      Object.values(bundle).forEach((chunk) => {
        if (chunk.type == 'chunk' && chunk.code.includes('WEB_ASSET(')) {
          chunk.code = replaceAssets(chunk.code);
        }
      });
    },

    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        if (!html.includes('WEB_ASSET(')) {
          return html;
        }

        return replaceAssets(html);
      },
    },
  };
};
