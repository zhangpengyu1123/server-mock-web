#!/usr/bin/env node
/* 回到"立卡"形态（v5 资产），但插入改成横向推入；机位保持 45° 等轴测 */
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

/* 几何：立卡插在平板上（板面 0.710 / 卡底 0.650 / 5 槽） */
rep(/const G = \{[\s\S]*?\n\};/, `const G = {
  boardTop: 0.710,
  bayCols: 5, bayRows: 1,
  bayPitchX: 0.420, bayPitchY: 0.0,
  bayW: 0.380, bayD: 0.030, bayDepth: 0.060,
  cardSeatY: 0.650,        // 卡片底缘落点
  insertFrom: 0.52,        // 横向推入起点（板前方 +Z）
  spacing: 2.92,
  boardPlateY: 0.662, boardPlateZ: 0.4312, boardPlateW: 0.84, boardPlateH: 0.082,
  railY: 0.7065, railZ: 0.398,
  cardT: 0.018,
};
`, 'G');

/* 卡片：立起来，铭牌贴在前脸 */
rep(/      root\.position\.set\(bay\.x, G\.cardSeatY, G\.insertFrom\);[\s\S]*?      root\.add\(plate\);/,
`      root.position.set(bay.x, G.cardSeatY, G.insertFrom);   // 从前方横向推入
      root.scale.setScalar(1.10);
      board.root.add(root);

      // 立卡前脸的显著铭牌（朝 +Z，也就是朝向相机侧）
      const name = mp.name || mp.path || mp.id;
      const tall = kind === 'FS';
      const plateW = tall ? 0.300 : 0.282;
      const plateH = tall ? 0.098 : 0.086;
      const plateYc = tall ? 0.318 : 0.292;
      const plate = this.makePlate(plateW, plateH,
        [name, String(mp.method || 'GET').toUpperCase() + '  ' + (mp.path || '')],
        { big: 68, code: kind, accent: kind === 'OMC' ? '#3f8f93' : '#d79a44' });
      plate.position.set(0, plateYc, G.cardT / 2 + 0.0018);   // 竖直朝向 +Z
      root.add(plate);`, 'card vertical + plate');

/* 命中光晕位置 */
rep(`      glow.position.set(0, plateY, 0.10);`, `      glow.position.set(0, plateYc, 0.10);`, 'glow');

/* 插仓索引（5 槽一排） */
rep(`      if (slot >= board.bays.length) return;`, `      if (slot >= board.bays.length) return;`, 'bounds');

/* 插入动画：横向推入（z: insertFrom → 0），落位后轻微回弹 */
rep(/      const delay = 0\.08 \+ i \* 0\.05;[\s\S]*?m\.root\.position\.y -= settle;/,
`      const delay = 0.08 + i * 0.05;
      const k = Math.max(0, Math.min(1, (this.intro - delay) * 1.45));
      const ease = 1 - Math.pow(1 - k, 3);
      m.root.position.z = G.insertFrom * (1 - ease);   // 横向推入
      m.root.position.y = m.seatY;
      const settle = Math.sin(Math.min(1, Math.max(0, (k - 0.85) / 0.15)) * Math.PI) * 0.005;
      m.root.position.y -= settle;`, 'horizontal insert');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
