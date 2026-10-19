#!/usr/bin/env node
'use strict';

const fs = require('fs');

const sourcePath = '/root/ayan/bridge/public/made/cat-rabbit-front-diagonal-motion-preview-v2.html';
const outputPath = '/root/ayan/bridge/public/made/cat-rabbit-front-diagonal-motion-preview-v3.html';

let html = fs.readFileSync(sourcePath, 'utf8');
html = html
  .replace('猫兔前斜试跑场 v2', '猫兔前斜试跑场 v3')
  .replace("rabbit-front-diagonal-run-03-squint.png", "rabbit-front-diagonal-run-03-squint-v2.png")
  .replace("cat-front-diagonal-run-03-squint.png", "cat-front-diagonal-run-03-squint-v2.png");

fs.writeFileSync(outputPath, html);
console.log(outputPath);
