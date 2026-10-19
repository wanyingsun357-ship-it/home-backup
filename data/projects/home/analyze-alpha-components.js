#!/usr/bin/env node
'use strict';

const sharp = require('/root/ayan/games/little-nest-tour/node_modules/sharp');

async function main() {
  const file = process.argv[2];
  const threshold = Number(process.argv[3] || 12);
  if (!file) throw new Error('usage: analyze-alpha-components.js <png> [alpha-threshold]');

  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components = [];

  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] || data[start * channels + 3] <= threshold) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = (index / width) | 0;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (!seen[next] && data[next * channels + 3] > threshold) {
            seen[next] = 1;
            queue[tail++] = next;
          }
        }
      }
    }

    if (count >= 16) components.push({ count, minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 });
  }

  components.sort((a, b) => b.count - a.count);
  console.log(JSON.stringify({ file, threshold, width, height, components: components.slice(0, 40) }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
