#!/usr/bin/env node
/* scene.js 对齐 v7：插槽沿深度并排（面贴面）、卡片竖直插入、铭牌贴卡面上部 */
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

rep(/const G = \{[\s\S]*?\n\};/, `const G = {
  boardTop: 0.710,
  bayCols: 1, bayRows: 5,          // 沿深度并排的 5 条窄槽 = 面贴面的卡排
  bayPitchX: 0.0, bayPitchY: 0.082,
  bayW: 0.360, bayD: 0.026, bayDepth: 0.055,
  cardSeatY: 0.655,
  insertLift: 0.85,                // 竖直插入起点
  spacing: 2.92,                   // 主板横向成排
  boardPlateY: 0.662, boardPlateZ: 0.4312, boardPlateW: 0.84, boardPlateH: 0.082,
  railY: 0.7065, railZ: 0.398,
  cardT: 0.018,
};
`, 'G');

/* 卡片：竖直插入（y 从上方落下），铭牌在卡面上部 */
rep(/      root\.position\.set\(bay\.x, G\.cardSeatY, G\.insertFrom\);[\s\S]*?      root\.add\(plate\);/,
`      root.position.set(bay.x, G.cardSeatY + G.insertLift, bay.y);
      root.scale.setScalar(1.06);
      board.root.add(root);

      // 铭牌贴在卡面**上部**：面贴面并排时，45° 俯视每张卡露出的就是这条
      const name = mp.name || mp.path || mp.id;
      const tall = kind === 'FS';
      const plateW = tall ? 0.300 : 0.286;
      const plateH = tall ? 0.076 : 0.068;
      const plateYc = tall ? 0.352 : 0.322;
      const plate = this.makePlate(plateW, plateH,
        [name, String(mp.method || 'GET').toUpperCase() + '  ' + (mp.path || '')],
        { big: 72, code: kind, accent: kind === 'OMC' ? '#3f8f93' : '#d79a44' });
      plate.position.set(0, plateYc, G.cardT / 2 + 0.0016);
      root.add(plate);`, 'card vertical + top plate');

/* 插入动画：竖直落位 */
rep(/      m\.root\.position\.z = G\.insertFrom \* \(1 - ease\);   \/\/ 横向推入\n      m\.root\.position\.y = m\.seatY;/,
    `      m.root.position.y = m.seatY + G.insertLift * (1 - ease);   // 竖直插入`, 'vertical insert');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
