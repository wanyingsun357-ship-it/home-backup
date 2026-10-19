#!/usr/bin/env node
'use strict';

const fs = require('fs');

const input = '/root/ayan/bridge/public/made/cat-rabbit-front-diagonal-motion-preview-v1.html';
const output = '/root/ayan/bridge/public/made/cat-rabbit-front-diagonal-motion-preview-v2.html';
let html = fs.readFileSync(input, 'utf8');

const replacements = [
  ['<title>猫兔前斜试跑场 v1</title>', '<title>猫兔前斜试跑场 v2 · 偶发眯眼</title>'],
  ['<h1>猫兔前斜试跑场 v1</h1>', '<h1>猫兔前斜试跑场 v2</h1>'],
  ['十二张前斜生产帧直接来自已验收的 v4；向左下由同一组帧水平镜像，不重新画身体。', '基础动作沿用已验收的 v1；兔兔开心腾空、猫猫高速冲刺时会低频随机眯眼。'],
  ["source.src='./cat-rabbit-front-diagonal-run-atlas-v1.png';", "source.src='./cat-rabbit-front-diagonal-run-atlas-v1.png';\n    const squintSources={rabbit:new Image(),cat:new Image()};\n    squintSources.rabbit.src='./pet-assets/front-diagonal-run-v1/rabbit-front-diagonal-run-03-squint.png';\n    squintSources.cat.src='./pet-assets/front-diagonal-run-v1/cat-front-diagonal-run-03-squint.png';"],
  ["const pets={rabbit:{row:0,t:0,frame:0,prevFrame:-1,active:true,delay:0,lane:38},cat:{row:1,t:-.12,frame:0,prevFrame:-1,active:true,delay:460,lane:-48}};", "const pets={rabbit:{row:0,t:0,frame:0,prevFrame:-1,active:true,delay:0,lane:38,squint:true},cat:{row:1,t:-.12,frame:0,prevFrame:-1,active:true,delay:460,lane:-48,squint:true}};"],
  ["pets.rabbit.active=which==='rabbit'||which==='both';pets.cat.active=which==='cat'||which==='both';}", "pets.rabbit.active=which==='rabbit'||which==='both';pets.cat.active=which==='cat'||which==='both';pets.rabbit.squint=true;pets.cat.squint=true;}"],
  ["ctx.drawImage(source,sx,sy,cellW,cellH,-size/2,top,size,size);ctx.restore();}", "if(p.frame===2&&p.squint){ctx.drawImage(squintSources[p.row===0?'rabbit':'cat'],-size/2,top,size,size);}else{ctx.drawImage(source,sx,sy,cellW,cellH,-size/2,top,size,size);}ctx.restore();}"],
  ["p.delay=mode==='both'&&kind==='cat'?380:160;p.prevFrame=-1;}}", "p.delay=mode==='both'&&kind==='cat'?380:160;p.prevFrame=-1;p.squint=Math.random()<.28;}}"],
  ["source.onload=()=>{ready=true;reset();};", "let loaded=0;const markReady=()=>{loaded+=1;if(loaded===3){ready=true;reset();}};source.onload=markReady;squintSources.rabbit.onload=markReady;squintSources.cat.onload=markReady;"],
  ['当前读取 448×448 RGBA 前斜生产帧；统一锚点为 (224,438)，左前斜只做水平镜像。', '当前读取基础帧与两张 448×448 RGBA 眯眼变体；第一轮演示一次，之后每轮约 28% 概率触发。']
];

for (const [from, to] of replacements) {
  if (!html.includes(from)) throw new Error(`missing replacement target: ${from.slice(0, 80)}`);
  html = html.replace(from, to);
}

fs.writeFileSync(output, html);
console.log(output);
