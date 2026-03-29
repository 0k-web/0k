<script lang="ts">
  import { ZipReader, type FileEntry } from '@zip.js/zip.js/lib/core/zip-reader.js';
  import { BlobReader, BlobWriter } from '@zip.js/zip.js/lib/core/io.js';
  import { guessContentType, htmlContentType } from '../contentTypes';

  const escapeHtml = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const decodePath = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const getIndexChildren = (directory: URL, htmlUrls: URL[]) => {
    const children = new Map<string, string>();
    for (const url of htmlUrls) {
      if (!url.pathname.startsWith(directory.pathname) || url.href == directory.href) {
        continue;
      }

      const relative = url.pathname.slice(directory.pathname.length).replace(/^\/+/, '');
      if (!relative) continue;

      const segments = relative.split('/').filter(Boolean);
      if (segments.length == 0) continue;

      const child =
        segments.length == 1 && !relative.endsWith('/') ? segments[0] : `${segments[0]}/`;
      children.set(child, child);
    }

    return [...children]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([href, path]) => ({ href, label: decodePath(path) }));
  };
  const makeGeneratedIndex = (
    title: string,
    directory: URL,
    children: { href: string; label: string }[],
  ) => {
    const pathLabel = escapeHtml(decodePath(directory.pathname));
    return `<!doctype html>
<html lang="en">
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}${pathLabel}</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: system-ui, sans-serif;
      background: Canvas;
      color: CanvasText;
    }
    body {
      max-width: 48rem;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }
    h1 {
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
    }
    p {
      margin: 0 0 1.5rem;
      color: color-mix(in oklab, CanvasText 70%, Canvas 30%);
    }
    ul {
      margin: 0;
      padding-left: 1.25rem;
    }
    li + li {
      margin-top: 0.5rem;
    }
    a {
      color: LinkText;
    }
  </style>
  <body>
    <h1>${escapeHtml(title)}${pathLabel}</h1>
    <ul>
      ${directory.pathname == '/' ? '' : '<li><a href="../">../</a></li>\n      '}${children
        .map(({ href, label }) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`)
        .join('\n      ')}
    </ul>
  </body>
</html>`;
  };

  let { close }: { close: () => void } = $props();

  let files: FileList | undefined = $state();
  let file = $derived(files?.item(0));
  let title = $state('site');

  $effect(() => {
    if (file) {
      title = file.name
        .toLowerCase()
        .replace('.zip', '')
        .replace(/[^a-z-]/g, '');
    }
  });

  const create = async () => {
    const topLevelReader = new BlobReader(file!);
    const zipReader = new ZipReader(topLevelReader);
    try {
      const entries = await zipReader.getEntries();
      const files = entries.filter((entry): entry is FileEntry => !entry.directory);
      const keys = files.map((e) => e.filename);

      let commonPrefix = '';
      if (keys.length > 0) {
        commonPrefix = keys[0];
        for (let i = 1; i < keys.length; i++) {
          while (commonPrefix && keys[i].indexOf(commonPrefix) != 0) {
            commonPrefix = commonPrefix.slice(0, -1);
          }
        }
      }

      const cache = await caches.open(`0k-site/${title}`);
      const htmlUrls: URL[] = [];
      const indexCandidates = new Set<string>();
      for (const file of files) {
        const path =
          '/' +
          file.filename.slice(commonPrefix.length).replace('index.html', '').replace('.html', '');
        const url = new URL(path, `https://${title}.0k`);

        const contentType = guessContentType(file.filename);
        const content = await file.getData(new BlobWriter(contentType));

        await cache.put(
          url,
          new Response(content, {
            headers: { 'content-type': contentType },
          }),
        );

        if (contentType == htmlContentType) {
          htmlUrls.push(url);

          let candidate = new URL('.', url);
          while (true) {
            indexCandidates.add(candidate.href);
            if (candidate.pathname == '/') break;
            candidate = new URL('..', candidate);
          }
        }
      }

      for (const candidate of indexCandidates) {
        if (await cache.match(candidate)) continue;

        const directory = new URL(candidate);
        const children = getIndexChildren(directory, htmlUrls);
        if (children.length == 0) continue;

        await cache.put(
          directory,
          new Response(makeGeneratedIndex(title, directory, children), {
            headers: { 'content-type': htmlContentType },
          }),
        );
      }
    } finally {
      await zipReader.close();
    }
  };
</script>

<dialog
  ontoggle={(e) => {
    if (e.newState == 'closed') close();
  }}
  closedby="any"
  {@attach (node) => node.showModal()}
>
  {#if file}
    <div class="row">
      <input class="title" bind:value={title} /><span>.0k</span>
      <div style:width="4rem"></div>
      <button onclick={() => create().then(close)}>Create</button>
    </div>
  {:else}
    <label>
      A file, a folder, a GitHub repo - all goes as long as it's in a .zip. Drop or click.
      <input
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        required
        bind:files
      />
    </label>
  {/if}
</dialog>

<style>
  dialog {
    inset: 0;
    margin: auto;
    z-index: 2;

    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    border-radius: 1rem;
    background-color: var(--m3c-surface-container-highest);

    transition: scale var(--transition);
    --transition: cubic-bezier(0.05, 0.7, 0.1, 1) 400ms;

    @starting-style {
      scale: 0;
    }
  }
  dialog::backdrop {
    background-color: oklch(from var(--m3c-scrim) l c h / 0.5);
    transition: background-color var(--transition);

    @starting-style {
      background-color: transparent;
    }
  }

  label {
    display: grid;
    text-align: center;
    max-width: 20rem;

    padding: 0.5rem;
    border-radius: 0.5rem;

    color: var(--m3c-on-surface-variant);
    border: dashed 2px var(--m3c-outline);

    position: relative;
  }
  label > input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .row {
    display: flex;
  }
  .row > .title {
    field-sizing: content;
  }
  .row > span {
    align-self: center;
  }
  .row > button {
    display: flex;
    align-items: center;
    height: 2.5rem;
    border-radius: 1.25rem;
    padding-inline: 1rem;
    background-color: var(--m3c-primary);
    color: var(--m3c-on-primary);
  }
</style>
