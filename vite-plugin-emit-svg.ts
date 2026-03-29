import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Plugin, ResolvedConfig } from 'vite';

const escapeCdataEnd = (content: string) => content.replace(/\]\]>/g, ']]]]><![CDATA[>');

const normalizeInlineStyleAttributes = (attrs: string) => {
  const normalizedAttrs = attrs
    .replace(
      /\s+(?:rel=(?:"[^"]*"|'[^']*'|[^\s>]+)|crossorigin(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)/gi,
      '',
    )
    .trim();

  return normalizedAttrs ? ` ${normalizedAttrs}` : '';
};

const mergeInlineStyles = (existingStyle: string | undefined, extraStyle: string) => {
  const normalizedExisting = existingStyle?.trim().replace(/;+\s*$/, '') ?? '';
  const normalizedExtra = extraStyle.trim().replace(/;+\s*$/, '');

  return normalizedExisting ? `${normalizedExisting};${normalizedExtra}` : normalizedExtra;
};

const injectBodyStyle = (html: string) =>
  html.replace(/<body([^>]*)>/i, (_match, attrs) => {
    const styleMatch = attrs.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i);
    const mergedStyle = mergeInlineStyles(
      styleMatch?.[2],
      'margin:0;width:100%;height:100%;overflow:hidden',
    );
    const attrsWithoutStyle = styleMatch ? attrs.replace(styleMatch[0], '').trim() : attrs.trim();

    return attrsWithoutStyle
      ? `<body ${attrsWithoutStyle} style="${mergedStyle}">`
      : `<body style="${mergedStyle}">`;
  });

const makeInlineXhtml = (html: string) => {
  // Phase 1: extract + transform all script/style blocks first.
  // Backreference \1 ensures <script> only closes on </script> and vice versa,
  // so <script> or <style> tags inside JS string literals never match.
  const blocks: string[] = [];
  const stripped = html.replace(
    /<(script|style)([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tagName: 'script' | 'style', attrs: string, content: string) => {
      if (!content.trim()) {
        blocks.push(match);
      } else if (tagName === 'script') {
        blocks.push(
          `<script>//<![CDATA[\ndocument.addEventListener('DOMContentLoaded', () => {\n${escapeCdataEnd(content)}\n});\n//]]></script>`,
        );
      } else {
        blocks.push(
          `<style${normalizeInlineStyleAttributes(attrs)}>/*<![CDATA[*/\n${escapeCdataEnd(content)}\n/*]]>*/</style>`,
        );
      }
      return `\x00BLOCK${blocks.length - 1}\x00`;
    },
  );

  // Phase 2: remaining HTML is safe — no script/style content to confuse transforms
  const transformed = injectBodyStyle(
    stripped
      .replace(/<!doctype html>\s*/i, '')
      .replace(
        /<html([^>]*)>/i,
        '<html xmlns="http://www.w3.org/1999/xhtml"$1 style="width:100%;height:100%">',
      ),
  );

  // Phase 3: restore processed blocks
  return transformed.replace(/\x00BLOCK(\d+)\x00/g, (_, i) => blocks[+i]);
};

const makeIndexSvg = (html: string) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  <foreignObject width="100%" height="100%">
    ${makeInlineXhtml(html)}
  </foreignObject>
</svg>
`;

export const emitIndexSvg = (): Plugin => {
  let CONFIG: ResolvedConfig | undefined;

  return {
    name: 'emit-index-svg',
    apply: 'build',

    configResolved(resolvedConfig) {
      CONFIG = resolvedConfig;
    },

    async closeBundle() {
      if (!CONFIG) {
        throw new Error('no config');
      }

      const outDir = resolve(CONFIG.root, CONFIG.build.outDir);
      const INDEX_HTML_PATH = resolve(outDir, 'index.html');
      const INDEX_SVG_PATH = resolve(outDir, 'index.svg');
      const html = await readFile(INDEX_HTML_PATH, 'utf8');

      await writeFile(INDEX_SVG_PATH, makeIndexSvg(html));
      await rm(INDEX_HTML_PATH);
    },
  };
};
