#!/usr/bin/env node
/* 把 three.js addons 的依赖闭包补全到 ui/vendor（镜像 examples/jsm 的目录结构）。
   扫描已下载文件的相对 import，缺哪个从 unpkg 拉哪个，直到闭包完整。
   零依赖：Node 18+ 自带 fetch。 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';

const VENDOR = resolve('console/ui/vendor');
const BASE = 'https://unpkg.com/three@0.160.0/examples/jsm/';

// 结构对齐 examples/jsm：loaders/ utils/ controls/ postprocessing/ shaders/ libs/
const SEEDS = [
  'loaders/GLTFLoader.js',
  'utils/BufferGeometryUtils.js',
  'controls/OrbitControls.js',
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/MaskPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'shaders/CopyShader.js',
  'shaders/LuminosityHighPassShader.js',
  'shaders/OutputShader.js'
];

const relImport = /(?:import|export)[^'"]*from\s*['"](\.[^'"]+)['"]/g;
const seen = new Set();
const fetched = [];
const failed = [];

async function get(relPath) {
  if (seen.has(relPath)) return;
  seen.add(relPath);
  const abs = join(VENDOR, relPath);
  if (!existsSync(abs)) {
    const url = BASE + relPath.split(sep).join('/');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, txt, 'utf8');
      fetched.push(relPath);
    } catch (e) {
      failed.push(relPath + ' :: ' + e.message);
      return;
    }
  }
  const src = readFileSync(abs, 'utf8');
  const deps = new Set();
  let m;
  relImport.lastIndex = 0;
  while ((m = relImport.exec(src))) {
    const resolved = relative(VENDOR, resolve(dirname(abs), m[1])).split(sep).join('/');
    if (!resolved.startsWith('..')) deps.add(resolved);
  }
  for (const d of deps) await get(d);
}

for (const s of SEEDS) await get(s);

console.log('FILES ' + seen.size);
if (fetched.length) console.log('NEW   ' + fetched.join('\n      '));
if (failed.length) console.log('FAIL  ' + failed.join('\n      '));
