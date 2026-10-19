#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('/root/ayan/games/little-nest-tour/node_modules/sharp');

const ASSET_DIR = '/root/ayan/bridge/public/made/pet-assets/front-diagonal-run-v1';

async function featheredClone(imagePath, region, source) {
  const patch = await sharp(imagePath)
    .extract(source)
    .resize(region.width, region.height, { fit: 'fill' })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask = Buffer.from(`<svg width="${region.width}" height="${region.height}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter></defs><ellipse cx="${region.width / 2}" cy="${region.height / 2}" rx="${region.width / 2 - 2.5}" ry="${region.height / 2 - 2.5}" fill="white" filter="url(#b)"/></svg>`);
  const masked = await sharp(patch).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return { input: masked, left: region.left, top: region.top };
}

async function buildVariant({ inputName, outputName, clones, eyelids }) {
  const inputPath = path.join(ASSET_DIR, inputName);
  const outputPath = path.join(ASSET_DIR, outputName);
  const composites = [];
  for (const clone of clones) composites.push(await featheredClone(inputPath, clone.region, clone.source));
  const lidSvg = Buffer.from(`<svg width="448" height="448" xmlns="http://www.w3.org/2000/svg">${eyelids.map(lid => `<path d="${lid.path}" fill="none" stroke="${lid.color}" stroke-width="${lid.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`);
  composites.push({ input: lidSvg, left: 0, top: 0 });
  const editedRgb = await sharp(inputPath).composite(composites).removeAlpha().raw().toBuffer();
  const originalAlpha = await sharp(inputPath).extractChannel('alpha').raw().toBuffer();
  const rgba = Buffer.alloc(448 * 448 * 4);
  for (let pixel = 0; pixel < 448 * 448; pixel += 1) {
    rgba[pixel * 4] = editedRgb[pixel * 3];
    rgba[pixel * 4 + 1] = editedRgb[pixel * 3 + 1];
    rgba[pixel * 4 + 2] = editedRgb[pixel * 3 + 2];
    rgba[pixel * 4 + 3] = originalAlpha[pixel];
  }
  await sharp(rgba, { raw: { width: 448, height: 448, channels: 4 } }).png().toFile(outputPath);
  return outputPath;
}

async function main() {
  const rabbit = await buildVariant({
    inputName: 'rabbit-front-diagonal-run-03.png',
    outputName: 'rabbit-front-diagonal-run-03-squint.png',
    clones: [
      { region: { left: 284, top: 228, width: 52, height: 62 }, source: { left: 284, top: 200, width: 52, height: 27 } },
      { region: { left: 348, top: 225, width: 53, height: 65 }, source: { left: 326, top: 196, width: 53, height: 28 } }
    ],
    eyelids: [
      { path: 'M 292 261 Q 311 245 331 260', color: '#3b1915', width: 5 },
      { path: 'M 356 259 Q 373 246 390 258', color: '#3b1915', width: 4.5 }
    ]
  });
  const cat = await buildVariant({
    inputName: 'cat-front-diagonal-run-03.png',
    outputName: 'cat-front-diagonal-run-03-squint.png',
    clones: [
      { region: { left: 304, top: 247, width: 58, height: 67 }, source: { left: 304, top: 217, width: 58, height: 28 } },
      { region: { left: 367, top: 237, width: 52, height: 69 }, source: { left: 335, top: 204, width: 52, height: 29 } }
    ],
    eyelids: [
      { path: 'M 309 281 Q 333 267 358 280', color: '#17151d', width: 5 },
      { path: 'M 375 272 Q 391 261 406 271', color: '#17151d', width: 4.5 }
    ]
  });
  fs.writeFileSync(path.join(ASSET_DIR, 'squint-variants-v1.json'), `${JSON.stringify({
    version: 1,
    base_motion: 'front_diagonal_run_toward_viewer',
    variants: {
      rabbit: { replace_frame: 2, file: path.basename(rabbit), trigger: 'rare_happy_airborne_squint', duration_frames: 1 },
      cat: { replace_frame: 2, file: path.basename(cat), trigger: 'rare_wind_squint', duration_frames: 1 }
    },
    invariants: ['448x448 RGBA', 'same alpha as base frame', 'same pose and anchor as base frame', 'only the eye region changes']
  }, null, 2)}\n`);
  console.log(JSON.stringify({ rabbit, cat }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
