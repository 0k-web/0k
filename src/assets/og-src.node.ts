import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Theme = 'light' | 'dark';

const SEED = 0x0f0f0f;
const CELL = 12;

const palette = {
  light: {
    surface: '#daffec',
    blossom: '#00f299',
  },
  dark: {
    surface: '#00120a',
    blossom: '#00341d',
  },
} satisfies Record<Theme, { surface: string; blossom: string }>;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const hash = (x: number, y: number) => {
  let s = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ SEED;

  s ^= s >>> 15;
  s = Math.imul(s, 0x2c1b3c6d);
  s ^= s >>> 12;
  s = Math.imul(s, 0x297a2d39);
  s ^= s >>> 15;

  return (s >>> 0) / 0x100000000;
};

function buildBlossomPath(width: number, height: number) {
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);

  const originX = width / 2;
  const originY = height;
  const diag = Math.hypot(width / 2, height);

  let d = '';

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = (x + 0.5) * CELL;
      const py = (y + 0.5) * CELL;

      const dx = px - originX;
      const dy = py - originY;
      const chance = clamp(1.4 - (2 * Math.hypot(dx, dy)) / diag, 0, 1);

      if (hash(x, y) < chance) {
        d += `M${x} ${y}h1v1h-1z`;
      }
    }
  }

  return d;
}

function buildSvg(width: number, height: number, theme: Theme) {
  const { surface, blossom } = palette[theme];
  const blossomPath = buildBlossomPath(width, height);

  const viewWidth = width / CELL;
  const viewHeight = height / CELL;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${viewWidth} ${viewHeight}"
  shape-rendering="crispEdges"
>
  <rect width="${viewWidth}" height="${viewHeight}" fill="${surface}"/>
  <path fill="${blossom}" d="${blossomPath}"/>
</svg>`;
}

function usageAndExit(): never {
  console.error('Usage: tsx scripts/generate-og-svg.ts <width> <height> [outFile] [theme]');
  process.exit(1);
}

function parsePositiveInt(value: string | undefined, name: string) {
  if (!value) usageAndExit();

  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid ${name}: ${value}`);
    usageAndExit();
  }

  return n;
}

function parseTheme(value: string | undefined): Theme {
  if (value === undefined || value === 'dark') return 'dark';
  if (value === 'light') return 'light';

  console.error(`Invalid theme: ${value}`);
  usageAndExit();
}

function main() {
  const width = parsePositiveInt(process.argv[2], 'width');
  const height = parsePositiveInt(process.argv[3], 'height');
  const outFile = resolve(process.argv[4] ?? `public/og-${width}x${height}.svg`);
  const theme = parseTheme(process.argv[5]);

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, buildSvg(width, height, theme), 'utf8');

  console.log(`Wrote ${outFile}`);
}

main();
