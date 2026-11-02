#!/usr/bin/env node
/* 3D 网元卡动态铭牌：找到卡面标签凹槽（深色面），在其上贴 canvas 文字（名称 + 版本） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 铭牌贴图函数（插在 labelTexture 之后） */
rep(`const MAT = {};`,
`/* 卡面铭牌：名称 + 版本 + 编号刻度（透明底，贴在深色标签凹槽上） */
function nameplateTexture(name, version, code) {
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#171713';
  g.fillRect(0, 0, W, H);
  // 边框刻度
  g.strokeStyle = 'rgba(234,229,225,.35)';
  g.lineWidth = 2;
  g.strokeRect(8, 8, W - 16, H - 16);
  // 左上角编号
  g.fillStyle = '#a67d48';
  g.fillRect(16, 16, 6, 40);
  g.fillStyle = 'rgba(234,229,225,.55)';
  g.font = '500 22px "JetBrains Mono",monospace';
  g.fillText(code || '', 32, 44);
  // 名称
  g.fillStyle = '#eae5e1';
  g.font = '600 60px "JetBrains Mono","PingFang SC",monospace';
  let nm = String(name || '');
  while (g.measureText(nm).width > W - 48 && nm.length > 4) nm = nm.slice(0, -2) + '…';
  g.fillText(nm, 32, 132);
  // 版本
  g.fillStyle = '#a67d48';
  g.font = '600 40px "JetBrains Mono",monospace';
  g.fillText('v' + String(version || ''), 32, 200);
  // 右侧小刻度
  g.fillStyle = 'rgba(234,229,225,.28)';
  for (let i = 0; i < 6; i++) g.fillRect(W - 120 + i * 16, 176, 8, 3);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const MAT = {};`, 'nameplate fn');

/* 2) 给网元模块贴铭牌（插在 inst() 之后） */
rep(`  /* 程序化回退 */`,
`  /** 在网元模块的标签凹槽上贴动态铭牌 */
  attachNameplate(mod, name, version, code) {
    // 找深色标签面（材质名含 TopoDark 且面积最大的那块）
    let target = null, best = 0;
    mod.traverse((c) => {
      if (!c.isMesh || !c.material) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      const dark = mats.some((m) => /TopoDark/i.test(m.name || ''));
      if (!dark) return;
      c.geometry.computeBoundingBox();
      const s = c.geometry.boundingBox.getSize(new THREE.Vector3());
      const area = s.x * s.y;
      if (area > best) { best = area; target = c; }
    });
    if (!target) return;
    target.geometry.computeBoundingBox();
    const bb = target.geometry.boundingBox;
    const center = bb.getCenter(new THREE.Vector3());
    const size = bb.getSize(new THREE.Vector3());
    const wide = Math.max(size.x, size.y) * 0.92;
    const tall = wide * 0.5;
    const tex = nameplateTexture(name, version, code);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(wide, tall),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
    );
    // 贴在标签面外侧 1mm（标签面朝 -Z，见 Blender 侧 ne_label 的 y=-0.027）
    plane.position.set(center.x, center.y, center.z - 0.0025);
    plane.rotation.y = Math.PI;
    plane.renderOrder = 6;
    mod.add(plane);
  }

  /* 程序化回退 */`, 'attach nameplate');

/* 3) 元件级：给每个网元贴铭牌 */
rep(`        this.addLabel(mod, e.name, e.type + ' · v' + e.version, this.models ? 0.60 : 0.34, 1.0,
          { big: 42, small: 22, tick: /5\.2\.1/.test(e.version) ? '#a67d48' : null });`,
`        if (this.models) this.attachNameplate(mod, e.name, e.version, e.id.toUpperCase());
        this.addLabel(mod, e.name, e.type + ' · v' + e.version, this.models ? 0.60 : 0.34, 1.0,
          { big: 42, small: 22, tick: /5\.2\.1/.test(e.version) ? '#a67d48' : null });`, 'NE nameplate element');

/* 4) 组件级：中心网元也贴 */
rep(`      this.addLabel(mod, ne.name, ne.type + ' · v' + ne.version, this.models ? 0.86 : 0.35, 1.15, { big: 46, small: 26, tick: '#a67d48' });`,
`      if (this.models) this.attachNameplate(mod, ne.name, ne.version, ne.id.toUpperCase());
      this.addLabel(mod, ne.name, ne.type + ' · v' + ne.version, this.models ? 0.86 : 0.35, 1.15, { big: 46, small: 26, tick: '#a67d48' });`, 'NE nameplate component');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
