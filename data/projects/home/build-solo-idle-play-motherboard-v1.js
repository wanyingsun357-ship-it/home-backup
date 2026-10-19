#!/usr/bin/env node
'use strict';

const fs = require('fs');
const sharp = require('/root/ayan/games/little-nest-tour/node_modules/sharp');

const WIDTH = 2172;
const HEIGHT = 724;
const CELL_W = WIDTH / 6;
const CELL_H = HEIGHT / 2;
const BASELINE = 335;
const OUTPUT = '/root/ayan/bridge/public/made/cat-rabbit-solo-idle-play-motherboard-v1.png';

const sources = {
  cat: '/root/ayan/bridge/public/made/ayan-cat-sprite-concept-v1.png',
  rabbit: '/root/ayan/bridge/public/made/wanying-rabbit-sprite-concept-v8.png'
};

const poses = [
  { species: 'cat', name: 'sit', rect: { left: 73, top: 528, width: 188, height: 273 } },
  { species: 'cat', name: 'head_tilt', rect: { left: 57, top: 801, width: 223, height: 296 } },
  { species: 'cat', name: 'show_paw', rect: { left: 391, top: 808, width: 253, height: 290 } },
  { species: 'cat', name: 'lick_paw', rect: { left: 766, top: 536, width: 242, height: 265 } },
  { species: 'cat', name: 'wash_face', rect: { left: 1123, top: 536, width: 232, height: 267 } },
  { species: 'cat', name: 'belly_up', rect: { left: 363, top: 332, width: 313, height: 179 } },
  { species: 'rabbit', name: 'sit', rect: { left: 1094, top: 24, width: 273, height: 262 } },
  { species: 'rabbit', name: 'head_tilt', rect: { left: 44, top: 847, width: 272, height: 255 } },
  { species: 'rabbit', name: 'wink_rest', rect: { left: 700, top: 98, width: 339, height: 176 } },
  { species: 'rabbit', name: 'show_paw', rect: { left: 1083, top: 321, width: 284, height: 249 } },
  { species: 'rabbit', name: 'happy_pounce', rect: { left: 39, top: 569, width: 297, height: 256 } },
  { species: 'rabbit', name: 'belly_up', rect: { left: 1051, top: 561, width: 351, height: 280 }, trim: true }
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
    data[pixel * channels] = 0;
    data[pixel * channels + 1] = 0;
    data[pixel * channels + 2] = 0;
    data[pixel * channels + 3] = 0;
  }
  const png = await sharp(data, { raw: { width, height, channels } }).png().toBuffer();
  return { data: png, width, height };
}

async function extractPose(pose) {
  try {
    let image = sharp(sources[pose.species]).extract(pose.rect).ensureAlpha();
    if (pose.trim) {
      const cropped = await image.png().toBuffer();
      image = sharp(cropped).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha();
    }
    const buffer = await image.png().toBuffer();
    return keepLargestAlphaComponent(buffer);
  } catch (error) {
    throw new Error(`${pose.species}:${pose.name} ${JSON.stringify(pose.rect)}: ${error.message}`);
  }
}

async function main() {
  const composites = [];
  const manifest = [];
  for (let i = 0; i < poses.length; i += 1) {
    const pose = poses[i];
    const row = Math.floor(i / 6);
    const col = i % 6;
    const sprite = await extractPose(pose);
    const left = Math.round(col * CELL_W + (CELL_W - sprite.width) / 2);
    const top = Math.round(row * CELL_H + BASELINE - sprite.height);
    composites.push({ input: sprite.data, left, top });
    manifest.push({ species: pose.species, name: pose.name, row, col, left, top, width: sprite.width, height: sprite.height });
  }

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite(composites).png().toFile(OUTPUT);

  fs.writeFileSync('/root/ayan/bridge/public/made/cat-rabbit-solo-idle-play-motherboard-v1.json', `${JSON.stringify({
    version: 1,
    canvas: { width: WIDTH, height: HEIGHT, format: 'RGBA' },
    source_mother_sheets: sources,
    note: 'Exact mother-sheet artwork is extracted and rearranged; no character is regenerated or recolored.',
    poses: manifest
  }, null, 2)}\n`);
  console.log(JSON.stringify({ output: OUTPUT, poses: manifest.length }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
