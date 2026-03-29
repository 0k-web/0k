import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { build as rolldownBuild } from 'rolldown';
import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

import type { Plugin, ResolvedConfig } from 'vite';

const assets = [
  {
    name: 'scramjet.js',
    src: 'node_modules/@mercuryworkshop/scramjet/dist/scramjet.js',
    cdn: 'https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet@2.0.2-alpha/dist/scramjet.js',
  },
  {
    name: 'scramjet.wasm',
    src: 'node_modules/@mercuryworkshop/scramjet/dist/scramjet.wasm',
    cdn: 'https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet@2.0.2-alpha/dist/scramjet.wasm',
  },
  {
    name: 'controller.inject.js',
    src: 'node_modules/@mercuryworkshop/scramjet-controller/dist/controller.inject.js',
    cdn: 'https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet-controller@0.0.9/dist/controller.inject.js',
  },
] as const;

const webAssets = (): Plugin => {
  const assetMap = new Map<string, string>();
  let useJsdelivr = false;

  function replaceAssets(content: string): string {
    return content.replace(/WEB_ASSET\(([^)]+)\)/g, (_, filename) => {
      const assetUrl = assetMap.get(filename);
      if (!assetUrl) {
        throw new Error(
          `WEB_ASSET: Could not find asset "${filename}". Available assets: ${Array.from(assetMap.keys()).join(', ')}`,
        );
      }
      return assetUrl;
    });
  }

  return {
    name: 'web-assets',
    apply: 'build',

    config(_, { mode }) {
      useJsdelivr = Boolean(loadEnv(mode, process.cwd(), '').SCRAMJET_USE_JSDELIVR);
    },

    async generateBundle(_, bundle) {
      assetMap.clear();
      assets.forEach((asset) => {
        const assetUrl = useJsdelivr
          ? asset.cdn
          : `./${this.getFileName(
              this.emitFile({
                type: 'asset',
                name: asset.name,
                source: readFileSync(asset.src),
              }),
            )}`;

        assetMap.set(asset.name, assetUrl);
      });

      Object.values(bundle).forEach((chunk) => {
        if (chunk.type == 'chunk' && chunk.code.includes('WEB_ASSET(')) {
          chunk.code = replaceAssets(chunk.code);
        }
      });
    },

    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!html.includes('WEB_ASSET(')) {
          return html;
        }

        return replaceAssets(html);
      },
    },
  };
};

const bundleServiceWorker = (): Plugin => {
  const entry = '+sw.ts';
  let config: ResolvedConfig | undefined;

  return {
    name: 'bundle-service-worker',
    apply: 'build',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    async closeBundle() {
      if (!config) {
        return;
      }

      await rolldownBuild({
        cwd: config.root,
        input: resolve(config.root, entry),
        platform: 'browser',
        tsconfig: resolve(config.root, 'tsconfig.app.json'),
        output: {
          file: resolve(config.root, config.build.outDir, 'sw.js'),
          format: 'es',
          sourcemap: config.build.sourcemap,
          minify: config.build.minify !== false,
          codeSplitting: false,
        },
      });
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        index: 'index.html',
      },
    },
  },
  plugins: [svelte(), webAssets(), viteSingleFile(), bundleServiceWorker()],
});
