const utf8 = (type: string) => `${type}; charset=utf-8`;

const contentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.css': utf8('text/css'),
  '.csv': utf8('text/csv'),
  '.gif': 'image/gif',
  '.htm': utf8('text/html'),
  '.html': utf8('text/html'),
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': utf8('text/javascript'),
  '.json': utf8('application/json'),
  '.map': utf8('application/json'),
  '.md': utf8('text/markdown'),
  '.mjs': utf8('text/javascript'),
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': utf8('image/svg+xml'),
  '.tsv': utf8('text/tab-separated-values'),
  '.txt': utf8('text/plain'),
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.webmanifest': utf8('application/manifest+json'),
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': utf8('application/xml'),
};

export const htmlContentType = contentTypes['.html'];

export const guessContentType = (filename: string) =>
  contentTypes[/\.[^./]+$/.exec(filename.toLowerCase())?.[0] || ''] || 'application/octet-stream';

const weakContentTypes = new Set(['application/octet-stream', 'text/plain']);

export const maybeOverrideWeakContentType = (headers: Headers, path: string) => {
  const current = headers.get('content-type');
  const currentMime = current?.split(';', 1)[0].trim().toLowerCase();
  const guessed = guessContentType(path);

  if (!current) {
    headers.set('content-type', guessed);
    return guessed;
  }

  if (currentMime && weakContentTypes.has(currentMime) && guessed != 'application/octet-stream') {
    headers.set('content-type', guessed);
    return guessed;
  }

  return current;
};
