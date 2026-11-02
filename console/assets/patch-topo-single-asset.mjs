#!/usr/bin/env node
/* 拓扑资产合并加载：一次拉 topo_all.glb，按对象名拆成 models 映射 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

const s = lines.findIndex((l) => l.includes('async loadModels()'));
if (s < 0) { console.log('MISS loadModels'); process.exit(1); }
let e = s;
let depth = 0, started = false;
for (let i = s; i < lines.length; i++) {
  for (const ch of lines[i]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
  if (started && depth === 0) { e = i; break; }
}

const body = String.raw`  async loadModels() {
    // 单文件资产：一次请求拿全部模型，再按对象名拆分
    const gltf = await new Promise((res, rej) =>
      this.loader.load(ASSETS + 'topo_all.glb?v=' + Date.now(), res, undefined, rej));
    const NAMES = {
      TOPO_SITE: 'site',
      TOPO_GROUP: 'group',
      TOPO_NE: 'ne',
      TOPO_COMP_CTRL: 'comp_ctrl',
      TOPO_COMP_SWITCH: 'comp_switch',
      TOPO_COMP_SERVICE: 'comp_service',
      TOPO_COMP_POWER: 'comp_power',
      TOPO_COMP_FAN: 'comp_fan',
    };
    this.models = {};
    const roots = [];
    gltf.scene.traverse((o) => {
      if (o.parent === gltf.scene) roots.push(o);
    });
    roots.forEach((node) => {
      const key = NAMES[node.name];
      if (!key) return;
      const holder = new THREE.Group();
      const clone = node.clone(true);
      clone.position.set(0, 0, 0);
      clone.rotation.set(0, 0, 0);
      holder.add(clone);
      this.models[key] = { scene: holder };
    });
    // 通用芯片兜底 = 主控板
    if (!this.models.comp) this.models.comp = this.models.comp_ctrl || null;
  }`.split('\n');

lines = [...lines.slice(0, s), ...body, ...lines.slice(e + 1)];
writeFileSync(P, lines.join('\n'), 'utf8');
console.log('ok   loadModels 改为单文件加载（L' + (s + 1) + '）');
