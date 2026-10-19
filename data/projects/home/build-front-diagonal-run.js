#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('/root/ayan/games/little-nest-tour/node_modules/sharp');

const MADE = '/root/ayan/bridge/public/made';
const SOURCE_NAME = 'cat-rabbit-front-diagonal-locomotion-study-v4.png';
const SOURCE = path.join(MADE, SOURCE_NAME);
const OUTPUT_DIR = path.join(MADE, 'pet-assets/front-diagonal-run-v1');
const ATLAS_NAME = 'cat-rabbit-front-diagonal-run-atlas-v1.png';
const MANIFEST_NAME = 'cat-rabbit-front-diagonal-run-manifest-v1.json';
const FRAME_SIZE = 448;
const ANCHOR = [224, 438];

function alphaComponents(data, width, height, channels) {
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components = [];

  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] || data[start * channels + 3] === 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const pixels = [];
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = (index / width) | 0;
      pixels.push(index);
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
          if (!seen[next] && data[next * channels + 3] !== 0) {
            seen[next] = 1;
            queue[tail++] = next;
          }
        }
      }
    }

    if (pixels.length >= 1000) {
      components.push({ pixels, minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 });
    }
  }
  return components;
}

function alphaBBox(buffer) {
  let minX = FRAME_SIZE;
  let minY = FRAME_SIZE;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    for (let x = 0; x < FRAME_SIZE; x += 1) {
      if (buffer[(y * FRAME_SIZE + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

async function buildFrame(source, sourceWidth, channels, component, baseline, filename) {
  const canvas = Buffer.alloc(FRAME_SIZE * FRAME_SIZE * 4);
  const left = Math.round(ANCHOR[0] - component.width / 2);
  const top = ANCHOR[1] - baseline + component.minY;

  if (left < 0 || top < 0 || left + component.width > FRAME_SIZE || top + component.height > FRAME_SIZE) {
    throw new Error(`frame out of bounds: ${filename} left=${left} top=${top} ${component.width}x${component.height}`);
  }

  for (const sourceIndex of component.pixels) {
    const sx = sourceIndex % sourceWidth;
    const sy = (sourceIndex / sourceWidth) | 0;
    const dx = left + sx - component.minX;
    const dy = top + sy - component.minY;
    const sourceOffset = sourceIndex * channels;
    const destOffset = (dy * FRAME_SIZE + dx) * 4;
    canvas[destOffset] = source[sourceOffset];
    canvas[destOffset + 1] = source[sourceOffset + 1];
    canvas[destOffset + 2] = source[sourceOffset + 2];
    canvas[destOffset + 3] = source[sourceOffset + 3];
  }

  const output = path.join(OUTPUT_DIR, filename);
  await sharp(canvas, { raw: { width: FRAME_SIZE, height: FRAME_SIZE, channels: 4 } }).png().toFile(output);
  return { output, buffer: canvas, alpha_bbox: alphaBBox(canvas) };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const components = alphaComponents(data, info.width, info.height, info.channels);
  if (components.length !== 12) throw new Error(`expected 12 subjects, found ${components.length}`);

  const rabbit = components.filter(c => (c.minY + c.maxY) / 2 < info.height / 2).sort((a, b) => a.minX - b.minX);
  const cat = components.filter(c => (c.minY + c.maxY) / 2 >= info.height / 2).sort((a, b) => a.minX - b.minX);
  if (rabbit.length !== 6 || cat.length !== 6) throw new Error(`expected 6+6 subjects, found ${rabbit.length}+${cat.length}`);

  const baselines = {
    rabbit: Math.max(...rabbit.map(c => c.maxY)),
    cat: Math.max(...cat.map(c => c.maxY))
  };
  const frames = { rabbit: [], cat: [] };
  const atlasInputs = [];

  for (const [row, kind] of ['rabbit', 'cat'].entries()) {
    for (let index = 0; index < 6; index += 1) {
      const filename = `${kind}-front-diagonal-run-${String(index + 1).padStart(2, '0')}.png`;
      const result = await buildFrame(data, info.width, info.channels, { rabbit, cat }[kind][index], baselines[kind], filename);
      frames[kind].push({ index, file: `pet-assets/front-diagonal-run-v1/${filename}`, alpha_bbox: result.alpha_bbox });
      atlasInputs.push({ input: result.buffer, raw: { width: FRAME_SIZE, height: FRAME_SIZE, channels: 4 }, left: index * FRAME_SIZE, top: row * FRAME_SIZE });
    }
  }

  await sharp({ create: { width: FRAME_SIZE * 6, height: FRAME_SIZE * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(atlasInputs)
    .png()
    .toFile(path.join(MADE, ATLAS_NAME));

  const manifest = {
    version: 1,
    motion: 'front_diagonal_run_toward_viewer',
    frame_count: 6,
    frame_size: [FRAME_SIZE, FRAME_SIZE],
    anchor: ANCHOR,
    atlas: ATLAS_NAME,
    rows: { rabbit: 0, cat: 1 },
    direction: 'down_right',
    mirrored_direction: 'down_left',
    frames,
    source: SOURCE_NAME,
    source_baselines: baselines,
    notes: [
      'Twelve complete subjects are isolated as connected alpha components across the full sheet; no equal-width slicing is used.',
      'Each species uses one constant source baseline, preserving rabbit jump height and cat body bobbing.',
      'All frames are native source scale on 448x448 RGBA canvases with anchor (224,438); no subject is independently resized.',
      'The approved pale osmanthus-milk rabbit RGB and the cat pixels come directly from the accepted v4 sheet.'
    ]
  };
  fs.writeFileSync(path.join(MADE, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ source: SOURCE_NAME, components: components.length, baselines, atlas: ATLAS_NAME, manifest: MANIFEST_NAME, frames }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
