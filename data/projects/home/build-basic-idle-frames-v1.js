#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('/root/ayan/games/little-nest-tour/node_modules/sharp');

const SIZE = 448;
const ANCHOR_Y = 420;
const VERSION = process.env.IDLE_VERSION || 'v1';
const SOURCE_DIR = '/root/ayan/bridge/public/made/pet-assets/basic-idle-v1';
const DIR = `/root/ayan/bridge/public/made/pet-assets/basic-idle-${VERSION}`;

const specs = {
  cat: {
    base: path.join(SOURCE_DIR, 'cat-basic-idle-base.png'),
    bbox: { left: 130, top: 147, width: 188, height: 273 },
    eyes: [
      { cx: 179, cy: 251, rx: 25, ry: 28, patch: { left: 192, top: 190, width: 50, height: 34 } },
      { cx: 236, cy: 251, rx: 25, ry: 28, patch: { left: 192, top: 190, width: 50, height: 34 } }
    ],
    blinkPaths: ['M170 254 Q179 258 188 255', 'M227 255 Q236 258 245 254'],
    twitch: [
      { rect: { left: 264, top: 351, width: 54, height: 67 }, dx: 3, dy: -3 }
    ]
  },
  rabbit: {
    base: path.join(SOURCE_DIR, 'rabbit-basic-idle-base.png'),
    bbox: { left: 88, top: 158, width: 273, height: 262 },
    eyes: [
      { cx: 181, cy: 249, rx: 29, ry: 31, patch: { left: 197, top: 192, width: 58, height: 34 } },
      { cx: 253, cy: 249, rx: 29, ry: 31, patch: { left: 197, top: 192, width: 58, height: 34 } }
    ],
    blinkPaths: ['M172 253 Q181 256 190 255', 'M244 255 Q253 258 262 256'],
    twitch: [
      { rect: { left: 88, top: 238, width: 78, height: 112 }, dx: 3, dy: -3 }
    ]
  }
};

async function copyFrame(input, output) {
  await sharp(input).ensureAlpha().png().toFile(output);
}

async function breathe(spec, amount, output) {
  const base = await sharp(spec.base).ensureAlpha().png().toBuffer();
  const sprite = await sharp(base).extract(spec.bbox).resize({
    width: spec.bbox.width,
    height: spec.bbox.height + amount,
    fit: 'fill',
    kernel: sharp.kernel.lanczos3
  }).png().toBuffer();
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite([{ input: sprite, left: spec.bbox.left, top: ANCHOR_Y - spec.bbox.height - amount }]).png().toFile(output);
}

function ellipseMask(width, height, cx, cy, rx, ry) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/></svg>`);
}

async function blink(spec, output) {
  let current = await sharp(spec.base).ensureAlpha().png().toBuffer();
  for (const eye of spec.eyes) {
    const patch = await sharp(spec.base).extract(eye.patch).resize({ width: eye.rx * 2 + 8, height: eye.ry * 2 + 8, fit: 'fill' }).blur(0.6).png().toBuffer();
    const featheredMask = await sharp(ellipseMask(eye.rx * 2 + 8, eye.ry * 2 + 8, eye.rx + 4, eye.ry + 4, eye.rx + 2, eye.ry + 2)).blur(1.1).png().toBuffer();
    const masked = await sharp(patch).composite([{
      input: featheredMask,
      blend: 'dest-in'
    }]).png().toBuffer();
    current = await sharp(current).composite([{
      input: masked,
      left: eye.cx - eye.rx - 4,
      top: eye.cy - eye.ry - 4
    }]).png().toBuffer();
  }
  const paths = spec.blinkPaths.map(d => `<path d="${d}" fill="none" stroke="#24242d" stroke-width="3.2" stroke-linecap="round"/>`).join('');
  const lines = Buffer.from(`<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`);
  const rendered = await sharp(current).composite([{ input: lines }]).png().toBuffer();
  const { data: rgb, info } = await sharp(rendered).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = await sharp(spec.base).extractChannel('alpha').raw().toBuffer();
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let pixel = 0; pixel < SIZE * SIZE; pixel += 1) {
    rgba[pixel * 4] = rgb[pixel * info.channels];
    rgba[pixel * 4 + 1] = rgb[pixel * info.channels + 1];
    rgba[pixel * 4 + 2] = rgb[pixel * info.channels + 2];
    rgba[pixel * 4 + 3] = alpha[pixel];
  }
  await sharp(rgba, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile(output);
}

async function twitch(spec, output) {
  let current = await sharp(spec.base).ensureAlpha().png().toBuffer();
  for (const part of spec.twitch) {
    const crop = await sharp(spec.base).extract(part.rect).ensureAlpha().png().toBuffer();
    current = await sharp(current).composite([{
      input: crop,
      left: part.rect.left + part.dx,
      top: part.rect.top + part.dy
    }]).png().toBuffer();
  }
  await sharp(current).png().toFile(output);
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const v3 = VERSION === 'v3';
  const manifest = {
    version: VERSION,
    frame: { width: SIZE, height: SIZE, format: 'RGBA', anchor: [224, ANCHOR_Y] },
    sequence: v3 ? [
      { frame: 1, action: 'neutral', duration_ms: 650 },
      { frame: 2, action: 'inhale', duration_ms: 280 },
      { frame: 3, action: 'neutral', duration_ms: 780 },
      { frame: 4, action: 'species_motion', duration_ms: 170 },
      { frame: 5, action: 'neutral', duration_ms: 900 }
    ] : [
      { frame: 1, action: 'neutral', duration_ms: 650 },
      { frame: 2, action: 'inhale', duration_ms: 280 },
      { frame: 3, action: 'neutral', duration_ms: 520 },
      { frame: 4, action: 'blink', duration_ms: 125 },
      { frame: 5, action: 'neutral', duration_ms: 780 },
      { frame: 6, action: 'ear_tail_twitch', duration_ms: 170 },
      { frame: 7, action: 'neutral', duration_ms: 900 }
    ],
    note: v3
      ? 'No blink frame. Cat moves only the tail tip; rabbit moves only one ear tip. Frames derive deterministically from approved seated mother-sheet sprites.'
      : 'Frames are derived deterministically from the exact approved seated mother-sheet sprites. Generated redraws are excluded.'
  };

  for (const [species, spec] of Object.entries(specs)) {
    const outputs = Array.from({ length: v3 ? 5 : 7 }, (_, i) => path.join(DIR, `${species}-basic-idle-${String(i + 1).padStart(2, '0')}.png`));
    await copyFrame(spec.base, outputs[0]);
    await breathe(spec, 2, outputs[1]);
    await copyFrame(spec.base, outputs[2]);
    if (v3) {
      await twitch(spec, outputs[3]);
      await copyFrame(spec.base, outputs[4]);
    } else {
      await blink(spec, outputs[3]);
      await copyFrame(spec.base, outputs[4]);
      await twitch(spec, outputs[5]);
      await copyFrame(spec.base, outputs[6]);
    }
  }

  fs.writeFileSync(path.join(DIR, 'idle-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
