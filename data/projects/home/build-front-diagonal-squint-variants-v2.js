#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('/root/ayan/games/little-nest-tour/node_modules/sharp');

const ASSET_DIR = '/root/ayan/bridge/public/made/pet-assets/front-diagonal-run-v1';

async function featheredClone(imagePath, region, source, blur = 2.2) {
  const patch = await sharp(imagePath)
    .extract(source)
    .resize(region.width, region.height, { fit: 'fill' })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask = Buffer.from(`<svg width="${region.width}" height="${region.height}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><ellipse cx="${region.width / 2}" cy="${region.height / 2}" rx="${region.width / 2 - 2.5}" ry="${region.height / 2 - 2.5}" fill="white" filter="url(#b)"/></svg>`);
  const masked = await sharp(patch).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return { input: masked, left: region.left, top: region.top };
}

async function rebuildVariant({ baseName, priorName, outputName, cleanup, eyelids }) {
  const basePath = path.join(ASSET_DIR, baseName);
  const priorPath = path.join(ASSET_DIR, priorName);
  const outputPath = path.join(ASSET_DIR, outputName);
  const composites = [];
  for (const clone of cleanup) composites.push(await featheredClone(priorPath, clone.region, clone.source, clone.blur));
  const lidSvg = Buffer.from(`<svg width="448" height="448" xmlns="http://www.w3.org/2000/svg">${eyelids.map(lid => `<path d="${lid.path}" fill="none" stroke="${lid.color}" stroke-width="${lid.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`);
  composites.push({ input: lidSvg, left: 0, top: 0 });

  const editedRgb = await sharp(priorPath).composite(composites).removeAlpha().raw().toBuffer();
  const originalAlpha = await sharp(basePath).extractChannel('alpha').raw().toBuffer();
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
  const rabbit = await rebuildVariant({
    baseName: 'rabbit-front-diagonal-run-03.png',
    priorName: 'rabbit-front-diagonal-run-03-squint.png',
    outputName: 'rabbit-front-diagonal-run-03-squint-v2.png',
    cleanup: [
      { region: { left: 285, top: 242, width: 55, height: 31 }, source: { left: 285, top: 215, width: 55, height: 23 }, blur: 2.5 },
      { region: { left: 279, top: 249, width: 24, height: 23 }, source: { left: 279, top: 226, width: 24, height: 17 }, blur: 2.2 },
      { region: { left: 350, top: 241, width: 47, height: 30 }, source: { left: 344, top: 214, width: 47, height: 23 }, blur: 2.5 }
    ],
    eyelids: [
      { path: 'M 307 260 Q 318 253 330 259', color: '#4a2b28', width: 3.0 },
      { path: 'M 369 258 Q 379 252 389 257', color: '#4a2b28', width: 2.8 }
    ]
  });

  const cat = await rebuildVariant({
    baseName: 'cat-front-diagonal-run-03.png',
    priorName: 'cat-front-diagonal-run-03-squint.png',
    outputName: 'cat-front-diagonal-run-03-squint-v2.png',
    cleanup: [
      { region: { left: 300, top: 260, width: 68, height: 34 }, source: { left: 300, top: 229, width: 68, height: 25 }, blur: 2.7 },
      { region: { left: 368, top: 250, width: 47, height: 32 }, source: { left: 362, top: 221, width: 47, height: 24 }, blur: 2.5 }
    ],
    eyelids: [
      { path: 'M 338 284 Q 350 289 362 282', color: '#37333f', width: 2.8 },
      { path: 'M 383 279 Q 393 283 403 277', color: '#37333f', width: 2.6 }
    ]
  });

  const manifest = {
    version: 2,
    base_motion: 'front_diagonal_run_toward_viewer',
    expression_reference: {
      rabbit: '/made/wanying-rabbit-sprite-concept-v8.png',
      cat: '/made/ayan-cat-sprite-concept-v1.png'
    },
    variants: {
      rabbit: { replace_frame: 2, file: path.basename(rabbit), trigger: 'rare_happy_airborne_squint', duration_frames: 1 },
      cat: { replace_frame: 2, file: path.basename(cat), trigger: 'rare_wind_squint', duration_frames: 1 }
    },
    invariants: ['448x448 RGBA', 'same alpha as base frame', 'same pose and anchor as base frame', 'only the eye region changes'],
    notes: ['shorter, thinner eyelids copied from each character mother sheet', 'cat and rabbit keep species-specific closed-eye shapes']
  };
  fs.writeFileSync(path.join(ASSET_DIR, 'squint-variants-v2.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ rabbit, cat }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
