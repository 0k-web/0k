#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  renameSync,
  chmodSync,
  readdirSync,
  unlinkSync,
  createWriteStream,
} from 'node:fs';
import { pipeline } from 'node:stream/promises';
import cachedir from 'cachedir';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const platforms = {
  'darwin-arm64': 'tunnel-0k-mac-arm64',
  'darwin-x64': 'tunnel-0k-mac-x64',
  'linux-arm64': 'tunnel-0k-linux-arm64',
  'linux-x64': 'tunnel-0k-linux-x64',
  'win32-x64': 'tunnel-0k-windows-x64.exe',
};

const key = `${process.platform}-${process.arch}`;
const binaryName = platforms[key];
if (!binaryName) {
  console.error(`Unsupported platform: ${key}`);
  process.exit(1);
}

const cacheDir = cachedir('0k');
mkdirSync(cacheDir, { recursive: true });

const url = `https://github.com/abndnce/0k/releases/latest/download/${binaryName}`;
const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
if (!head.ok) throw new Error(`Failed to check for updates (${head.status})`);

const etag = head.headers.get('etag')?.replace(/"/g, '');
if (!etag) throw new Error('No etag in response');
const binaryPath = join(cacheDir, `${binaryName}-${etag}`);

if (!existsSync(binaryPath)) {
  console.log(`Downloading ${binaryName}...`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to download (${res.status} ${res.statusText})`);

  const tmpPath = binaryPath + '.tmp';
  await pipeline(res.body, createWriteStream(tmpPath));

  chmodSync(tmpPath, 0o755);
  renameSync(tmpPath, binaryPath);

  for (const name of readdirSync(cacheDir)) {
    if (name.startsWith(binaryName) && name !== `${binaryName}-${etag}`) {
      unlinkSync(join(cacheDir, name));
    }
  }
}

execFileSync(binaryPath, process.argv.slice(2), { stdio: 'inherit' });
