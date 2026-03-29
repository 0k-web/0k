import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { build as rolldownBuild } from 'rolldown';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { emitIndexSvg } from './vite-plugin-emit-svg';
import { webAssets } from './vite-plugin-web-assets';
import { normalizeGitHubBehavior } from './src/githubBehavior';

import type { Plugin, ResolvedConfig } from 'vite';

const GITHUB_BEHAVIOR = normalizeGitHubBehavior(process.env.ZERO_K_DEFAULT_GITHUB_BEHAVIOR);
const INDEX_FORMAT = process.env.ZERO_K_INDEX_FORMAT || 'html';

const normalizeSingleFile = (): Plugin => {
  let CONFIG: ResolvedConfig | undefined;

  return {
    name: 'normalize-single-file',
    apply: 'build',

    configResolved(resolvedConfig) {
      CONFIG = resolvedConfig;
    },

    async closeBundle() {
      if (!CONFIG) {
        return;
      }

      const outDir = resolve(CONFIG.root, CONFIG.build.outDir);
      const INDEX_HTML_PATH = resolve(outDir, 'index.html');
      const html = await readFile(INDEX_HTML_PATH, 'utf8');

      await writeFile(
        INDEX_HTML_PATH,
        html
          .replace(/<script\b([^>]*)>/gi, (match, attrs) => {
            if (attrs.includes('src=')) {
              return match;
            }

            return `<script${attrs.replace(/\s+crossorigin(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/i, '')}>`;
          })
          .replace(/<style\b([^>]*)>/gi, '<style>'),
      );
    },
  };
};

const bundleServiceWorker = (): Plugin => {
  const ENTRY = '+sw.ts';
  let CONFIG: ResolvedConfig | undefined;

  return {
    name: 'bundle-service-worker',
    apply: 'build',

    configResolved(resolvedConfig) {
      CONFIG = resolvedConfig;
    },

    async closeBundle() {
      if (!CONFIG) {
        return;
      }

      await rolldownBuild({
        cwd: CONFIG.root,
        input: resolve(CONFIG.root, ENTRY),
        platform: 'browser',
        tsconfig: resolve(CONFIG.root, 'tsconfig.app.json'),
        output: {
          file: resolve(CONFIG.root, CONFIG.build.outDir, 'sw.js'),
          format: 'es',
          sourcemap: CONFIG.build.sourcemap,
          minify: CONFIG.build.minify !== false,
          codeSplitting: false,
        },
      });
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  define: {
    defaultGitHubBehavior: JSON.stringify(GITHUB_BEHAVIOR),
  },
  build: {
    rolldownOptions: {
      input: {
        index: 'index.html',
      },
    },
    minify: false,
  },
  plugins: [
    svelte(),
    webAssets(),
    viteSingleFile(),
    normalizeSingleFile(),
    INDEX_FORMAT == 'svg' ? emitIndexSvg() : undefined,
    bundleServiceWorker(),
  ],
});
