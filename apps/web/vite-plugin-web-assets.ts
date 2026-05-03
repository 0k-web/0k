import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { Plugin } from 'vite';

type WebAssetSource = 'local' | 'jsdelivr' | 'esmsh' | 'statically';
type PackageAsset = {
  packageName: string;
  file: string;
  webAssetName?: string;
  moduleImportId?: string;
  urlImportId?: string;
};
type WebAssetsOptions = {
  canExternalize?: boolean;
};

const ASSETS: readonly PackageAsset[] = [
  {
    packageName: '@mercuryworkshop/scramjet',
    file: 'dist/scramjet.js',
    webAssetName: 'scramjet.js',
  },
  {
    packageName: '@mercuryworkshop/scramjet',
    file: 'dist/scramjet.wasm',
    webAssetName: 'scramjet.wasm',
  },
  {
    packageName: '@mercuryworkshop/scramjet-controller',
    file: 'dist/controller.inject.js',
    webAssetName: 'controller.inject.js',
  },
  { packageName: 'libcurl.js', file: 'libcurl.mjs', moduleImportId: 'libcurl.js' },
  { packageName: 'libcurl.js', file: 'libcurl.wasm', urlImportId: 'libcurl.js/libcurl.wasm?url' },
];

const versions = new Map<string, string>();
const byWebName = new Map<string, PackageAsset>();
const byModuleId = new Map<string, PackageAsset>();
const byUrlId = new Map<string, PackageAsset>();

for (const asset of ASSETS) {
  if (!versions.has(asset.packageName)) {
    const pkg = JSON.parse(
      await readFile(resolve('node_modules', asset.packageName, 'package.json'), 'utf8'),
    ) as { version: string };
    versions.set(asset.packageName, pkg.version);
  }
  if (asset.webAssetName) byWebName.set(asset.webAssetName, asset);
  if (asset.moduleImportId) byModuleId.set(asset.moduleImportId, asset);
  if (asset.urlImportId) byUrlId.set(asset.urlImportId, asset);
}

const WEB_ASSET_SOURCE = (process.env.ZERO_K_CDN as WebAssetSource | undefined) ?? 'local';
const USES_CDN = WEB_ASSET_SOURCE != 'local';
const URL_PREFIX = '\0web-asset-url:';

const sourcePath = (a: PackageAsset) => resolve('node_modules', a.packageName, a.file);
const cdnUrl = (a: PackageAsset) => {
  const v = versions.get(a.packageName)!;
  return WEB_ASSET_SOURCE == 'jsdelivr'
    ? `https://cdn.jsdelivr.net/npm/${a.packageName}@${v}/${a.file}`
    : WEB_ASSET_SOURCE == 'esmsh'
      ? `https://esm.sh/${a.packageName}@${v}/${a.file}?raw`
      : `https://cdn.statically.io/npm/${a.packageName}@${v}/${a.file}`;
};

export const webAssets = ({ canExternalize = true }: WebAssetsOptions = {}): Plugin => {
  // asset object → emitted rollup file ID (local builds only)
  const emitted = new Map<PackageAsset, string>();
  // populated in generateBundle once filenames are known, read by transformIndexHtml
  const webAssetUrls = new Map<string, string>();

  const assetUrl = (asset: PackageAsset, getFileName: (id: string) => string) =>
    USES_CDN ? cdnUrl(asset) : `./${getFileName(emitted.get(asset)!)}`;

  const replaceWebAssets = (s: string) =>
    s.replace(/WEB_ASSET\(([^)]+)\)/g, (_, name) => {
      const url = webAssetUrls.get(name);
      if (!url)
        throw new Error(
          `WEB_ASSET: unknown "${name}". Available: ${[...webAssetUrls.keys()].join(', ')}`,
        );
      return url;
    });

  return {
    name: 'web-assets',
    enforce: 'pre',
    apply: 'build',

    async buildStart() {
      emitted.clear();
      webAssetUrls.clear();
      if (!USES_CDN) {
        for (const asset of new Set([...byWebName.values(), ...byUrlId.values()])) {
          emitted.set(
            asset,
            this.emitFile({
              type: 'asset',
              name: basename(asset.file),
              source: await readFile(sourcePath(asset)),
            }),
          );
        }
      }
    },

    resolveId(source) {
      const m = byModuleId.get(source);
      if (m && canExternalize && USES_CDN) return { id: cdnUrl(m), external: true };
      if (byUrlId.has(source)) return URL_PREFIX + source;
      return null;
    },

    load(id) {
      if (!id.startsWith(URL_PREFIX)) return null;
      return `export default ${JSON.stringify(assetUrl(byUrlId.get(id.slice(URL_PREFIX.length))!, this.getFileName.bind(this)))};`;
    },

    generateBundle(_, bundle) {
      const getFileName = this.getFileName.bind(this);
      for (const [name, asset] of byWebName) webAssetUrls.set(name, assetUrl(asset, getFileName));
      for (const chunk of Object.values(bundle)) {
        if (chunk.type == 'chunk' && chunk.code.includes('WEB_ASSET('))
          chunk.code = replaceWebAssets(chunk.code);
      }
    },

    transformIndexHtml: {
      order: 'post',
      handler: (html) => (html.includes('WEB_ASSET(') ? replaceWebAssets(html) : html),
    },
  };
};
