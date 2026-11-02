#!/usr/bin/env node
/* 3D 拓扑交互增强：点选高亮（自身+邻接）、双击下钻（网元→组件）、选中态 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 记录连线与节点表，便于高亮 */
rep(`  link(a, b) {`,
`  link(a, b) {
    this.links = this.links || [];`, 'link init');

rep(`    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.root.add(m);
  }`,
`    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.root.add(m);
    if (this.lastFrom && this.lastTo) {
      this.links.push({ from: this.lastFrom, to: this.lastTo, mesh: m });
    }
  }

  /** 记录"这条线连接哪两个节点"（build 时按顺序调用） */
  edge(a, b) {
    this.lastFrom = a; this.lastTo = b;
    return this.link(this.anchorOf(a), this.anchorOf(b));
  }

  anchorOf(id) {
    const n = (this.nodes || []).find((o) => o.userData && o.userData.id === id);
    if (!n) return [0, 0.7, 0];
    const p = n.position;
    return [p.x, p.y + 0.12, p.z];
  }

  /** 选中高亮：自身加琥珀自发光，邻接节点提亮，其余压暗 */
  select(id) {
    if (!this.nodes) return;
    this.selected = id;
    const near = new Set([id]);
    (this.links || []).forEach((l) => {
      if (l.from === id) near.add(l.to);
      if (l.to === id) near.add(l.from);
    });
    this.nodes.forEach((o) => {
      const oid = (o.userData || {}).id;
      const on = near.has(oid);
      o.traverse((c) => {
        if (!c.isMesh || !c.material) return;
        const mm = c.material;
        if (mm.emissive) {
          if (oid === id) { mm.emissive.setHex(0xa67d48); mm.emissiveIntensity = 0.55; }
          else { mm.emissive.setHex(0x000000); mm.emissiveIntensity = 0; }
        }
        if (mm.transparent !== undefined) {
          mm.transparent = !on || oid !== id;
          mm.opacity = oid === id ? 1 : (on ? 0.92 : 0.42);
        }
      });
    });
    (this.links || []).forEach((l) => {
      const hit = l.from === id || l.to === id;
      l.mesh.material = l.mesh.material.clone();
      l.mesh.material.color.setHex(hit ? 0xa67d48 : 0x9a948a);
      l.mesh.material.emissiveIntensity = hit ? 1.6 : 0.25;
      l.mesh.scale.set(hit ? 1.6 : 0.8, 1, hit ? 1.6 : 0.8);
    });
  }`, 'link edge/select');

/* 2) 双击下钻 + 点击选中回调 */
rep(`    el.addEventListener('click', () => {
      if (!this.nodes) return;
      this.ray.setFromCamera(this.ptr, this.camera);
      const hits = this.ray.intersectObjects(this.nodes, true);
      if (!hits.length) return;
      let o = hits[0].object;
      while (o && !o.userData.kind) o = o.parent;
      if (o && this.onPick) this.onPick(o.userData.id, o.userData);
    });`,
`    const pick = () => {
      if (!this.nodes) return null;
      this.ray.setFromCamera(this.ptr, this.camera);
      const hits = this.ray.intersectObjects(this.nodes, true);
      if (!hits.length) return null;
      let o = hits[0].object;
      while (o && !o.userData.kind) o = o.parent;
      return o || null;
    };
    el.addEventListener('click', () => {
      const o = pick();
      if (!o) return;
      this.select(o.userData.id);
      if (this.onPick) this.onPick(o.userData.id, o.userData);
    });
    el.addEventListener('dblclick', () => {
      const o = pick();
      if (!o) return;
      this.select(o.userData.id);
      if (this.onDrill) this.onDrill(o.userData.kind, o.userData.id);
    });`, 'pick select drill');

/* 3) mount 增加 onDrill */
rep(`window.PlaneTopo3D = {
  mount(host, state, onPick) {
    if (rig) return rig;
    rig = new Topo3D(host, state, onPick);
    return rig;
  },`,
`window.PlaneTopo3D = {
  mount(host, state, onPick, onDrill) {
    if (rig) { rig.state = state; rig.onPick = onPick; rig.onDrill = onDrill; return rig; }
    rig = new Topo3D(host, state, onPick, onDrill);
    return rig;
  },
  select(id) { if (rig) rig.select(id); },`, 'mount drill');

/* 4) 构造器接收 onDrill */
rep(`  constructor(host, state, onPick) {
    this.host = host;
    this.state = state;
    this.onPick = onPick;`,
`  constructor(host, state, onPick, onDrill) {
    this.host = host;
    this.state = state;
    this.onPick = onPick;
    this.onDrill = onDrill;`, 'ctor drill');

/* 5) build 里清理 links */
rep(`    this.nodes = [];
    this.labels = [];`, `    this.nodes = [];
    this.labels = [];
    this.links = [];
    this.lastFrom = null;
    this.lastTo = null;`, 'build reset');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
