#!/usr/bin/env node
/* 资产缓存：多次 mount/rebuild 只下载一次 topo_all.glb */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① 模块级缓存变量 */
const ci = lines.findIndex((l) => l.includes('let rig = null;'));
if (ci >= 0) {
  lines.splice(ci + 1, 0, 'let ASSET_PROMISE = null;   // 资产只拉一次，rebuild 复用');
  log.push('ok   缓存变量');
}

/* ② loadModels 走缓存 */
const s = lines.findIndex((l) => l.includes('async loadModels()'));
if (s >= 0) {
  lines[s + 1] = lines[s + 1].replace(
    '    // 单文件资产：一次请求拿全部模型，再按对象名拆分',
    '    // 单文件资产：一次请求拿全部模型（模块级缓存，rebuild 不再重复下载）');
  lines.splice(s + 2, 0,
    '    if (!ASSET_PROMISE) {',
    '      ASSET_PROMISE = new Promise((res, rej) =>',
    "        this.loader.load(ASSETS + 'topo_all.glb?v=1', res, undefined, rej));",
    '    }',
    '    const gltf = await ASSET_PROMISE;');
  log.push('ok   缓存读取');
} else log.push('MISS loadModels');

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
