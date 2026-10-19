#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('/root/ayan/games/little-nest-tour/node_modules/sharp');

const FRAME_SIZE = 448;
const ANCHOR_Y = 420;
const SOURCE_WIDTH = 2172;
const SOURCE_HEIGHT = 724;
const CELL_WIDTH = SOURCE_WIDTH / 4;
const OUT_DIR = '/root/ayan/bridge/public/made/pet-assets/basic-idle-connected-v1';

const studies = [
  {
    species: 'cat',
    action: 'tail_sway',
    source: '/root/ayan/bridge/public/made/cat-seated-tail-connected-study-v1.png',
    targetHeight: 273
  },
  {
    species: 'rabbit',
    action: 'ear_sway',
    source: '/root/ayan/bridge/public/made/rabbit-seated-ear-connected-study-v1.png',
    targetHeight: 262
  }
];

async function alphaBounds(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] <= 8) continue;
      if (x < left) left = x;
      if (y < top) top = y;
      if (x > right) right = x;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) throw new Error('No visible alpha component');
  return { left, top, right: right + 1, bottom: bottom + 1, width: right - left + 1, height: bottom - top + 1 };
}

async function buildStudy(study) {
  const quarters = [];
  for (let index = 0; index < 4; index += 1) {
    quarters.push(await sharp(study.source).extract({
      left: Math.round(index * CELL_WIDTH),
      top: 0,
      width: Math.round(CELL_WIDTH),
      height: SOURCE_HEIGHT
    }).ensureAlpha().png().toBuffer());
  }

  const firstBounds = await alphaBounds(quarters[0]);
  const scale = study.targetHeight / firstBounds.height;
  const resizedWidth = Math.round(CELL_WIDTH * scale);
  const resizedHeight = Math.round(SOURCE_HEIGHT * scale);
  const frames = [];

  for (let index = 0; index < quarters.length; index += 1) {
    const resized = await sharp(quarters[index]).resize({
      width: resizedWidth,
      height: resizedHeight,
      fit: 'fill',
      kernel: sharp.kernel.lanczos3
    }).ensureAlpha().png().toBuffer();
    const bounds = await alphaBounds(resized);
    const left = Math.round(FRAME_SIZE / 2 - resizedWidth / 2);
    const top = ANCHOR_Y - bounds.bottom;
    const output = path.join(OUT_DIR, `${study.species}-${study.action}-${String(index + 1).padStart(2, '0')}.png`);
    await sharp({
      create: { width: FRAME_SIZE, height: FRAME_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).composite([{ input: resized, left, top }]).png().toFile(output);
    frames.push({ index: index + 1, output, bounds, placement: { left, top }, scale });
  }
  return { species: study.species, action: study.action, source: study.source, targetHeight: study.targetHeight, frames };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = {
    version: 1,
    frame: { width: FRAME_SIZE, height: FRAME_SIZE, format: 'RGBA', anchor: [224, ANCHOR_Y] },
    note: 'Each motion frame is a complete connected character drawing. No rectangular body part is shifted.',
    studies: []
  };
  for (const study of studies) manifest.studies.push(await buildStudy(study));
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
