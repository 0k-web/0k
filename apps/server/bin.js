#!/usr/bin/env node

import { existsSync, mkdirSync, renameSync, chmodSync } from 'node:fs';
import { open } from 'node:fs/promises';
import cachedir from 'cachedir';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const platforms = {
  'darwin-arm64': 'tunnel-0k-mac-arm64',
  'darwin-x64': 'tunnel-0k-mac-x64',
  'linux-arm64': 'tunnel-0k-linux-arm64',
  'linux-x64': 'tunnel-0k-linux-x64',
  'win32-x64': 'tunnel-0k-win-x64.exe',
};

const key = `${process.platform}-${process.arch}`;
const binaryName = platforms[key];
if (!binaryName) {
  console.error(`Unsupported platform: ${key}`);
  process.exit(1);
}

const cacheDir = cachedir('0k');
const binaryPath = join(cacheDir, binaryName);

if (!existsSync(binaryPath)) {
  mkdirSync(cacheDir, { recursive: true });
  console.log(`Downloading ${binaryName}...`);

  const url = `https://github.com/0k-web/0k/releases/latest/download/${binaryName}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to download (${res.status} ${res.statusText})`);

  const tmpPath = binaryPath + '.tmp';
  const file = await open(tmpPath, 'w');
  for await (const chunk of res.body) file.write(chunk);
  await file.close();

  chmodSync(tmpPath, 0o755);
  renameSync(tmpPath, binaryPath);
}

execFileSync(binaryPath, process.argv.slice(2), { stdio: 'inherit' });
