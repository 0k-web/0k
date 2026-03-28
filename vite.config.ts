import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { build as rolldownBuild } from 'rolldown';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

import type { Plugin, ResolvedConfig } from 'vite';

const webAssets = (): Plugin => {
  const assets = {
    'scramjet.js': 'node_modules/@mercuryworkshop/scramjet/dist/scramjet.js',
    'scramjet.wasm': 'node_modules/@mercuryworkshop/scramjet/dist/scramjet.wasm',
    'controller.inject.js':
      'node_modules/@mercuryworkshop/scramjet-controller/dist/controller.inject.js',
  };

  const assetMap = new Map<string, string>();

  function replaceAssets(content: string): string {
    return content.replace(/WEB_ASSET\(([^)]+)\)/g, (_, filename) => {
      const hashedUrl = assetMap.get(filename);
      if (!hashedUrl) {
        throw new Error(
          `WEB_ASSET: Could not find asset "${filename}". Available assets: ${Array.from(assetMap.keys()).join(', ')}`,
        );
      }
      return `/${hashedUrl}`;
    });
  }

  return {
    name: 'web-assets',
    enforce: 'pre',

    async generateBundle(_, bundle) {
      await Promise.all(
        Object.entries(assets).map(async ([assetName, assetPath]) => {
          const content = assetName.endsWith('.js')
            ? readFileSync(assetPath, 'utf-8')
            : readFileSync(assetPath);

          const hashedName = this.emitFile({
            type: 'asset',
            name: assetName,
            source: content,
          });

          const finalName = this.getFileName(hashedName);
          assetMap.set(assetName, finalName);
        }),
      );

      Object.values(bundle).forEach((chunk) => {
        if (chunk.type == 'asset' && typeof chunk.source == 'string') {
          if (chunk.source.includes('WEB_ASSET(')) {
            chunk.source = replaceAssets(chunk.source);
          }
        }

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
