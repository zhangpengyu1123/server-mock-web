#!/usr/bin/env node
/* 3D 拓扑：流光点随选中链路联动 —— 精确锚点版 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.replace(from, to);
  log.push('ok   ' + tag);
};

/* ① select()：样式循环里补光点处理（紧跟 scale 之后） */
rep(`      l.mesh.scale.set(hit ? 1.8 : 0.7, 1, hit ? 1.8 : 0.7);
    });`,
`      l.mesh.scale.set(hit ? 1.8 : 0.7, 1, hit ? 1.8 : 0.7);
      // 流光点跟随选中：命中链路亮琥珀快速，其余灰暗慢速（无选中时恢复常态）
      l.hot = hit;
      if (l.dot) {
        l.dot.material.color.setHex(!id ? 0xffc978 : (hit ? 0xffd79a : 0x8f8b82));
        l.dot.material.emissive.setHex(!id ? 0xffc978 : (hit ? 0xffc978 : 0x5c5850));
        l.dot.material.emissiveIntensity = !id ? 1.6 : (hit ? 2.4 : 0.5);
        l.dot.visible = !id || hit;
      }
    });`, 'select dot 联动');

/* ② loop()：按 hot 调速与调亮 */
rep(`        const now = performance.now() / 3200;
        this.links.forEach((l) => {
          if (!l.dot) return;
          const k = ((now + l.phase) % 1);
          const e = k < 0.5 ? k * 2 : (1 - k) * 2;   // 往返
          l.dot.position.lerpVectors(l.a, l.b, e);
          l.dot.material.emissiveIntensity = 1.6 + Math.sin(e * Math.PI) * 1.6;
        });`,
`        const speedBoost = this.selected ? 1.35 : 1;
        const now = (performance.now() / 3200) * speedBoost;
        this.links.forEach((l) => {
          if (!l.dot) return;
          const dim = this.selected && l.hot === false;
          const k = (((now * (dim ? 0.3 : 1)) + l.phase) % 1);
          const e = k < 0.5 ? k * 2 : (1 - k) * 2;   // 往返
          l.dot.position.lerpVectors(l.a, l.b, e);
          const base = dim ? 0.3 : 1.6;
          l.dot.material.emissiveIntensity = base + Math.sin(e * Math.PI) * base;
        });`, 'loop 调速调亮');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
