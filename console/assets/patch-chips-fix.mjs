#!/usr/bin/env node
/* 修两个锚点：铭牌 chip 绘制 + 主板铭牌带状态/版本 */
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

/* chip 绘制：插在"末尾小刻度"之后 */
rep(`      for (let i = 0; i < 14; i++) g.fillRect(W - pad - i * 16, H - 26, 8, 3);`,
`      for (let i = 0; i < 14; i++) g.fillRect(W - pad - i * 16, H - 26, 8, 3);

      // —— chip：版本 + 状态（右下角，一眼区分启用/停用与版本） ——
      const chips = [];
      if (opts.version) {
        chips.push({
          text: 'v' + opts.version,
          fill: null,
          ink: opts.stale ? 'rgba(247,242,234,.40)' : '#d79a44',
          stale: !!opts.stale,
        });
      }
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
          g.strokeStyle = c.stale ? 'rgba(247,242,234,.22)' : 'rgba(247,242,234,.34)';
          g.lineWidth = 2;
          g.strokeRect(cx - bw, cy - 26, bw, 52);
        }
        g.fillStyle = c.ink;
        g.fillText(c.text, cx - bw + 15, cy);
        cx -= bw + 12;
      }`, 'chips draw');

/* 主板铭牌：带版本 + 状态 chip */
rep(`          { big: 120, code: 'X-' + String(bi + 1).padStart(3, '0'), accent: '#d79a44' });`,
`          {
            big: 120, code: 'X-' + String(bi + 1).padStart(3, '0'), accent: '#d79a44',
            version: node.version || '',
            state: node.status === 'online' ? 'ON' : node.status === 'updating' ? 'SYNC' : 'OFF',
          });`, 'board chips');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
