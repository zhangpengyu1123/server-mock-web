#!/usr/bin/env node
/* 构图收紧：拉近相机（缩小 FOV = 更"长焦"的特写感）、拉开主板间距、
   给拖拽加边界（方位角/极角/距离三重限制），避免转飞 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/admin/scene.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  const isRe = from instanceof RegExp;
  const hit = isRe ? from.test(t) : t.includes(from);
  if (!hit) { log.push('MISS ' + tag); if (isRe) from.lastIndex = 0; return; }
  t = isRe ? t.replace(from, () => to) : t.split(from).join(to);
  log.push('ok   ' + tag);
};

// 1) 主板间距 0.72 → 1.28（不再挤成一团，也不再空旷）
rep(`  spacing: 0.72,                    // 悬浮窄板横向成排`,
    `  spacing: 1.28,                    // 悬浮窄板横向成排（拉开，避免叠成一团）`, 'spacing');

// 2) 相机：FOV 40 → 32（长焦压缩），位置收紧到"一块板 + 卡排 + 信息区"占满画面
rep(`    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.05, 90);
    this.camera.position.set(0.62, 1.12, 0.94);   // 悬浮窄板 + 卡排的 45° 特写`,
`    this.camera = new THREE.PerspectiveCamera(32, w / h, 0.05, 90);
    this.camera.position.set(0.66, 1.06, 0.90);   // 长焦特写：单板占满画面`, 'camera');
rep(`    this.controls.target.set(0, 0.72, 0.06);`,
    `    this.controls.target.set(0, 0.76, 0.10);`, 'target');

// 3) 拖拽边界：方位角 ±60°、俯角 18°~72°、距离 0.55~3.2
rep(`    this.controls.minDistance = 0.55;`, `    this.controls.minDistance = 0.55;`, 'minDist keep');
rep(`    this.controls.maxDistance = 4.5;`,
`    this.controls.maxDistance = 3.2;
    // 拖拽边界：不让用户转到板背面或钻到板底下
    this.controls.minAzimuthAngle = -Math.PI / 3;
    this.controls.maxAzimuthAngle = Math.PI / 3;
    this.controls.minPolarAngle = Math.PI * 0.10;
    this.controls.maxPolarAngle = Math.PI * 0.40;`, 'orbit bounds');

// 4) 雾略微加浓，远处主板自然退到背景里（拉开间距后需要一点空气感）
rep(`    this.scene.fog = new THREE.FogExp2(C.haze, 0.018);`,
    `    this.scene.fog = new THREE.FogExp2(C.haze, 0.026);`, 'fog');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
