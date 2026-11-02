#!/usr/bin/env node
/* 记住 2D/3D 维度：切层级重渲染后仍回到 3D */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 状态默认 */
rep(`    topoLevel: 'element',`, `    topoLevel: 'element',
    topoDim: '2d',   // '2d' | '3d'（记住选择，切层级后仍生效）`, 'state dim');

/* 2D 点击 → 记住 2d */
rep(`        b2.addEventListener('click', () => {
          box3.style.display = 'none';`,
`        b2.addEventListener('click', () => {
          S.topoDim = '2d';
          box3.style.display = 'none';`, 'remember 2d');

/* 3D 点击 → 记住 3d */
rep(`        b3.addEventListener('click', () => {
          box3.style.display = 'block';`,
`        b3.addEventListener('click', () => {
          S.topoDim = '3d';
          box3.style.display = 'block';`, 'remember 3d');

/* 渲染后若维度是 3D 且容器可见，自动恢复 3D */
rep(`    if ($('#plHuman')) {
      $('#plHuman').addEventListener('click', (e) => { if (e.target.id === 'plHuman') closeHuman(); });
    }`,
`    if ($('#plHuman')) {
      $('#plHuman').addEventListener('click', (e) => { if (e.target.id === 'plHuman') closeHuman(); });
    }

    // 若当前维度是 3D，重渲染后自动恢复（切层级/刷新数据不丢 3D）
    if (S.view === 'topo' && S.topoDim === '3d') {
      const b3now = $('#btn3d');
      if (b3now) setTimeout(() => b3now.click(), 0);
    }`, 'restore 3d');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
