#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('/root/ayan/games/little-nest-tour/node_modules/sharp');

const SIZE = 448;
const BASELINE = 420;
const OUT_DIR = '/root/ayan/bridge/public/made/pet-assets/basic-idle-v1';

const sprites = [
  {
    species: 'cat',
    source: '/root/ayan/bridge/public/made/ayan-cat-sprite-concept-v1.png',
    rect: { left: 73, top: 528, width: 188, height: 273 }
  },
  {
    species: 'rabbit',
    source: '/root/ayan/bridge/public/made/wanying-rabbit-sprite-concept-v8.png',
    rect: { left: 1094, top: 24, width: 273, height: 262 }
  }
];

async function keepLargestAlphaComponent(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  let largest = [];

  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || data[start * channels + 3] <= 8) continue;
    const stack = [start];
    const pixels = [];
    visited[start] = 1;
    while (stack.length) {
      const index = stack.pop();
      pixels.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x + 1 < width) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - width);
      if (y + 1 < height) neighbors.push(index + width);
      for (const neighbor of neighbors) {
        if (!visited[neighbor] && data[neighbor * channels + 3] > 8) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }
    if (pixels.length > largest.length) largest = pixels;
  }

  const keep = new Uint8Array(width * height);
  for (const pixel of largest) keep[pixel] = 1;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (keep[pixel]) continue;
    const offset = pixel * channels;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = {
    version: 1,
    frame: { width: SIZE, height: SIZE, format: 'RGBA', anchor: [224, BASELINE] },
    note: 'Exact seated mother-sheet artwork, isolated without regeneration or recoloring.',
    sprites: []
  };

  for (const sprite of sprites) {
    const extracted = await sharp(sprite.source).extract(sprite.rect).ensureAlpha().png().toBuffer();
    const cleaned = await keepLargestAlphaComponent(extracted);
    const metadata = await sharp(cleaned).metadata();
    const left = Math.round((SIZE - metadata.width) / 2);
    const top = BASELINE - metadata.height;
    const output = path.join(OUT_DIR, `${sprite.species}-basic-idle-base.png`);

    await sharp({
      create: {
        width: SIZE,
        height: SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    }).composite([{ input: cleaned, left, top }]).png().toFile(output);

    manifest.sprites.push({
      species: sprite.species,
      source: sprite.source,
      source_rect: sprite.rect,
      output,
      placement: { left, top, width: metadata.width, height: metadata.height }
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
