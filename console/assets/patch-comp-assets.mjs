#!/usr/bin/env node
/* 组件级拓扑：按组件名选择对应芯片资产（主控/交换/业务/电源/风扇），缺省回退 topo_comp */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* ① 多资产加载 */
rep(`    const l = (n) => new Promise((res, rej) => this.loader.load(ASSETS + n + '.glb?v=' + Date.now(), res, undefined, rej));
    const [site, group, ne, comp] = await Promise.all([
      l('topo_site'), l('topo_group'), l('topo_ne'), l('topo_comp'),
    ]);
    this.models = { site, group, ne, comp };`,
`    const l = (n) => new Promise((res, rej) => this.loader.load(ASSETS + n + '.glb?v=' + Date.now(), res, undefined, rej));
    const names = ['site', 'group', 'ne', 'comp', 'comp_ctrl', 'comp_switch', 'comp_service', 'comp_power', 'comp_fan'];
    const loaded = await Promise.all(names.map((n) => l('topo_' + n).catch(() => null)));
    this.models = {};
    names.forEach((n, i) => { if (loaded[i]) this.models[n] = loaded[i]; });`, 'load many assets');

/* ② 组件名 → 资产键 */
rep(`  inst(kind) {`,
`  /** 组件名映射到资产：主控/交换/业务/电源/风扇，其余用通用芯片 */
  compKind(name) {
    const s = String(name || '');
    if (/主控|ctrl|control/i.test(s)) return 'comp_ctrl';
    if (/交换|switch/i.test(s)) return 'comp_switch';
    if (/业务|service|业务板/i.test(s)) return 'comp_service';
    if (/电源|power|psu/i.test(s)) return 'comp_power';
    if (/风扇|fan/i.test(s)) return 'comp_fan';
    return 'comp';
  }

  inst(kind) {
    if (this.models && !this.models[kind]) kind = 'comp';`, 'compKind');

/* ③ 组件级使用映射 */
rep(`        const chip = this.inst('comp') || new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), mat(0xd8d1c7, 0.55));`,
    `        const chip = this.inst(this.compKind(name)) || new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), mat(0xd8d1c7, 0.55));`, 'use compKind');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
