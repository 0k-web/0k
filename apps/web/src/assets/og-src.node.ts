// scripts/generate-og-svg.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Theme = 'light' | 'dark';

const WIDTH = 1280;
const HEIGHT = 640;
const SEED = 0x0f0f0f;

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

function buildPixelField(theme: Theme) {
  const { blossom } = palette[theme];

  // Bigger cells so the pattern reads clearly at OG size.
  const cell = 12;
  const cols = Math.ceil(WIDTH / cell);
  const rows = Math.ceil(HEIGHT / cell);

  let out = '';

  // Same origin as the original: bottom center.
  const originX = WIDTH / 2;
  const originY = HEIGHT;

  // Same general distance model as the original, but slightly widened
  // so the blossom occupies more of the OG frame.
  const diag = Math.hypot(WIDTH / 2, HEIGHT);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = (x + 0.5) * cell;
      const py = (y + 0.5) * cell;

      const dx = px - originX;
      const dy = py - originY;
      const d = Math.hypot(dx, dy);

      // Original was roughly:
      // chance = clamp(1.25 - (2 * d) / diag, 0, 1)
      //
      // This version keeps the same shape but expands it a bit so it
      // fills more of a 1280x640 OG image.
      const chance = clamp(1.32 - (1.72 * d) / diag, 0, 1);

      if (hash(x, y) < chance) {
        out += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${blossom}" />`;
      }
    }
  }

  return out;
}

function buildSvg(theme: Theme) {
  const { surface } = palette[theme];
  const pixels = buildPixelField(theme);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${WIDTH}"
  height="${HEIGHT}"
  viewBox="0 0 ${WIDTH} ${HEIGHT}"
  shape-rendering="crispEdges"
>
  <rect width="100%" height="100%" fill="${surface}" />
  ${pixels}
</svg>`;
}

function main() {
  const theme = process.argv[2] === 'light' ? 'light' : 'dark';
  const outFile = resolve(process.argv[3] ?? `public/og-${theme}.svg`);

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, buildSvg(theme), 'utf8');

  console.log(`Wrote ${outFile}`);
}

main();
