#!/usr/bin/env node
/* 强化「启用/停用」与「版本」的视觉区分
   1) 铭牌上加两枚 chip：版本（有版本才显示，落后于节点版本时变灰）+ 状态（ON/SYNC/OFF 色块）
   2) 停用的服务器卡：整卡压暗 + 盖一层半透明遮罩
   3) 离线的虚机（主板）：整板压暗
*/
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

/* ---------- 1) 铭牌绘制：chip（版本 / 状态） ---------- */
rep(`  // 末尾小刻度
  g.fillStyle = 'rgba(247,242,234,.28)';
  for (let i = 0; i < 14; i++) g.fillRect(W - pad - i * 16, H - 26, 8, 3);`,
`  // 末尾小刻度
  g.fillStyle = 'rgba(247,242,234,.28)';
  for (let i = 0; i < 14; i++) g.fillRect(W - pad - i * 16, H - 26, 8, 3);

  // —— chip：版本 + 状态（右下角，一眼区分启用/停用与版本） ——
  const chips = [];
  if (opts.version) chips.push({ text: 'v' + opts.version, fill: null, ink: opts.stale ? 'rgba(247,242,234,.42)' : '#d79a44' });
  if (opts.state) {
    const on = opts.state === 'ON';
    const sync = opts.state === 'SYNC';
    chips.push({
      text: opts.state,
      fill: on ? '#d79a44' : sync ? '#3f8f93' : 'rgba(247,242,234,.16)',
      ink: on || sync ? '#141210' : 'rgba(247,242,234,.72)',
    });
  }
  let cx = W - pad;
  const cy = H - 74;
  g.font = '600 40px "JetBrains Mono",ui-monospace,Consolas,monospace';
  g.textBaseline = 'middle';
  for (let k = chips.length - 1; k >= 0; k--) {
    const c = chips[k];
    const tw = g.measureText(c.text).width;
    const bw = tw + 30;
    if (c.fill) {
      g.fillStyle = c.fill;
      g.fillRect(cx - bw, cy - 26, bw, 52);
    } else {
      g.strokeStyle = 'rgba(247,242,234,.34)';
      g.lineWidth = 2;
      g.strokeRect(cx - bw, cy - 26, bw, 52);
    }
    g.fillStyle = c.ink;
    g.fillText(c.text, cx - bw + 15, cy);
    cx -= bw + 12;
  }`, 'chips');

/* ---------- 2) 服务器卡铭牌：带版本与 ON/OFF ---------- */
rep(`        { big: 110, code: kind, accent: kind === 'OMC' ? '#3f8f93' : '#d79a44' });`,
`        {
          big: 110, code: kind,
          accent: kind === 'OMC' ? '#3f8f93' : '#d79a44',
          version: mp.version || (board.node && board.node.version) || '',
          stale: !!(mp.version && board.node && mp.version !== board.node.version),
          state: mp.enabled === false ? 'OFF' : 'ON',
        });`, 'card chips');

/* ---------- 3) 停用的卡：整卡压暗 + 遮罩 ---------- */
rep(`      const bg = board.glows[slot];`,
`      // 停用：整卡压暗，并盖一层半透明遮罩，远看就能分辨
      if (mp.enabled === false) {
        root.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((mat) => {
            if (mat.color) mat.color.multiplyScalar(0.80);
            if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0;
          });
        });
        const veil = new THREE.Mesh(
          new THREE.PlaneGeometry(0.360, 0.360),
          new THREE.MeshBasicMaterial({ color: 0x1b1917, transparent: true, opacity: 0.34, depthWrite: false })
        );
        veil.position.set(0, 0.19, G.cardT / 2 + 0.0055);
        veil.renderOrder = 2;
        root.add(veil);
        mp.__veil = veil;
      }

      const bg = board.glows[slot];`, 'disabled veil');

/* ---------- 4) 主板铭牌：带节点版本与 ONLINE/OFF ---------- */
rep(`        [node.name || node.id, 'NODE ' + node.id.replace(/^node-/, '') + '   ·   ' + (node.version || '')],
        { big: 120, code: 'X-' + String(bi + 1).padStart(3, '0'), accent: '#d79a44' });`,
`        [node.name || node.id, 'NODE ' + node.id.replace(/^node-/, '') + '   ·   ' + (node.version || '')],
        {
          big: 120, code: 'X-' + String(bi + 1).padStart(3, '0'), accent: '#d79a44',
          version: node.version || '',
          state: node.status === 'online' ? 'ON' : node.status === 'updating' ? 'SYNC' : 'OFF',
        });`, 'board chips');

/* ---------- 5) 离线的虚机：整板压暗 ---------- */
rep(`      const board = { id: node.id, node, root, glows, rail, ribbon, bays: this.bayCenters(), index: bi };`,
`      // 离线：整板压暗一档（与在线板形成明显区别）
      if (node.status === 'offline') {
        root.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((mat) => {
            if (mat.color && mat.emissiveIntensity === undefined) mat.color.multiplyScalar(0.86);
          });
        });
      }

      const board = { id: node.id, node, root, glows, rail, ribbon, bays: this.bayCenters(), index: bi };`, 'offline board dim');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
